import { createClient } from '@supabase/supabase-js';
import { sendLineNotification } from '@/lib/line';
import { NextResponse } from 'next/server';

function isAuthorized(request: Request) {
  const cleanupSecret = process.env.ADMIN_CLEANUP_SECRET;
  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  const isVercelCron = request.headers.get('user-agent')?.includes('vercel-cron');
  return Boolean(cleanupSecret && (bearerToken === cleanupSecret || querySecret === cleanupSecret || isVercelCron));
}

function includesKeyword(item: { title?: string | null; give_details?: string | null; want_details?: string | null }, keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return false;
  return [item.title, item.give_details, item.want_details]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Condition tracking is not configured.' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const [{ data: items, error: itemsError }, { data: conditions, error: conditionsError }] = await Promise.all([
    supabase.from('items').select('id, user_id, title, give_details, want_details').gte('created_at', since),
    supabase.from('tracking_conditions').select('id, user_id, keyword'),
  ]);

  if (itemsError || conditionsError) {
    return NextResponse.json({ error: itemsError?.message || conditionsError?.message }, { status: 500 });
  }

  let checked = 0;
  let notified = 0;
  for (const item of items || []) {
    for (const condition of conditions || []) {
      checked += 1;
      if (condition.user_id === item.user_id || !includesKeyword(item, condition.keyword)) continue;
      const fingerprint = `tracking_${condition.id}_${item.id}`;
      const { error } = await supabase
        .from('match_notifications')
        .insert({ fingerprint, user_ids: [condition.user_id], match_type: 'condition-tracking' });
      if (error) {
        if (error.code === '23505') continue;
        console.error('Condition tracking insert failed:', error);
        continue;
      }
      const result = await sendLineNotification(
        condition.user_id,
        `【トレマチ】条件「${condition.keyword}」に合う交換情報が見つかりました。\nアプリを開いて内容を確認してください。`,
      );
      if (result.ok) notified += 1;
    }
  }

  return NextResponse.json({ checked, notified });
}
