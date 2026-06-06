import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { fingerprint, userIds, matchType } = await request.json();

    if (typeof fingerprint !== 'string' || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'Invalid match notification payload.' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!supabaseUrl || !serviceRoleKey || !lineToken) {
      return NextResponse.json({ error: 'Match notification is not configured.' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const uniqueUserIds = Array.from(new Set(userIds.filter((id): id is string => typeof id === 'string' && id.length > 0)));

    const { data: inserted, error } = await supabase
      .from('match_notifications')
      .insert({ fingerprint, user_ids: uniqueUserIds, match_type: matchType || 'unknown' })
      .select('fingerprint')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ notified: false, reason: 'duplicate' });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!inserted) {
      return NextResponse.json({ notified: false, reason: 'duplicate' });
    }

    const messageText = '【トレマチ】条件に合う交換候補が見つかりました。\nアプリを開いてマッチング内容を確認してください。';
    const results = await Promise.allSettled(
      uniqueUserIds.map((to) => fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lineToken}`,
        },
        body: JSON.stringify({ to, messages: [{ type: 'text', text: messageText }] }),
      })),
    );

    const failed = results.filter((result) => result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.ok)).length;
    return NextResponse.json({ notified: true, sent: uniqueUserIds.length - failed, failed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected match notification error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
