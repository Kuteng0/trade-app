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

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Pin expiration is not configured.' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date().toISOString();
  const { data: expiredItems, error: selectError } = await supabase
    .from('items')
    .select('id, user_id, title')
    .eq('is_pinned', true)
    .lt('pinned_until', now);

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const ids = (expiredItems || []).map((item) => item.id);
  if (ids.length > 0) {
    const { error: updateError } = await supabase
      .from('items')
      .update({ is_pinned: false })
      .in('id', ids);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  await Promise.allSettled((expiredItems || []).map((item) => sendLineNotification(
    item.user_id,
    `【トレマチ】「${item.title || 'グッズ'}」の置トップ掲載が終了しました。`,
  )));

  return NextResponse.json({ expired: ids.length });
}
