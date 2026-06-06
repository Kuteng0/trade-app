import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type CleanupSummary = {
  checked: number;
  deleted: number;
  skipped: number;
  errors: string[];
};

function getSupabaseStoragePath(imageUrl: string | null | undefined) {
  if (!imageUrl) return null;
  const marker = '/item-images/';
  const markerIndex = imageUrl.indexOf(marker);
  if (markerIndex === -1) return null;
  return decodeURIComponent(imageUrl.slice(markerIndex + marker.length).split('?')[0]);
}

export async function GET(request: Request) {
  const cleanupSecret = process.env.ADMIN_CLEANUP_SECRET;
  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  const isVercelCron = request.headers.get('user-agent')?.includes('vercel-cron');

  if (!cleanupSecret || (bearerToken !== cleanupSecret && querySecret !== cleanupSecret && !isVercelCron)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Cleanup is not configured.', missing: [!supabaseUrl ? 'NEXT_PUBLIC_SUPABASE_URL' : null, !serviceRoleKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null].filter(Boolean) },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const listStorageFiles = async (prefix = ''): Promise<string[]> => {
    const { data, error } = await supabase.storage.from('item-images').list(prefix, { limit: 1000 });

    if (error) {
      throw new Error(`Failed to list item-images/${prefix}: ${error.message}`);
    }

    const files = await Promise.all(
      (data || []).map(async (entry) => {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id === null) {
          return listStorageFiles(path);
        }
        return [path];
      }),
    );

    return files.flat();
  };
  const summary: CleanupSummary = { checked: 0, deleted: 0, skipped: 0, errors: [] };

  try {
    const [{ data: items, error: itemsError }, storageFiles] = await Promise.all([
      supabase.from('items').select('image_url').not('image_url', 'is', null),
      listStorageFiles(),
    ]);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const referencedPaths = new Set(
      (items || [])
        .map((item) => getSupabaseStoragePath(item.image_url))
        .filter((path): path is string => Boolean(path)),
    );

    summary.checked = storageFiles.length;

    for (const filePath of storageFiles) {
      if (referencedPaths.has(filePath)) {
        summary.skipped += 1;
        continue;
      }

      const { error } = await supabase.storage.from('item-images').remove([filePath]);
      if (error) {
        summary.errors.push(`${filePath}: ${error.message}`);
        continue;
      }

      summary.deleted += 1;
    }

    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected cleanup error.';
    summary.errors.push(message);
    return NextResponse.json(summary, { status: 500 });
  }
}
