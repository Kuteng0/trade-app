import { createClient } from '@supabase/supabase-js';
import { sendLineNotification } from '@/lib/line';
import { NextResponse } from 'next/server';

function includesKeyword(item: { title?: string | null; give_details?: string | null; want_details?: string | null }, keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return false;
  return [item.title, item.give_details, item.want_details]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

async function notifyForItem(itemId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: 'Condition notification is not configured.', status: 500 };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: item, error: itemError } = await supabase
    .from('items')
    .select('id, user_id, title, give_details, want_details')
    .eq('id', itemId)
    .maybeSingle();

  if (itemError || !item) {
    return { error: itemError?.message || 'Item not found.', status: 404 };
  }

  const { data: conditions, error: conditionError } = await supabase
    .from('tracking_conditions')
    .select('id, user_id, keyword');

  if (conditionError) {
    return { error: conditionError.message, status: 500 };
  }

  let notified = 0;
  for (const condition of conditions || []) {
    if (condition.user_id === item.user_id || !includesKeyword(item, condition.keyword)) continue;

    const fingerprint = `tracking_${condition.id}_${item.id}`;
    const { error: insertError } = await supabase
      .from('match_notifications')
      .insert({ fingerprint, user_ids: [condition.user_id], match_type: 'condition-tracking' });

    if (insertError) {
      if (insertError.code === '23505') continue;
      console.error('Condition notification insert failed:', insertError);
      continue;
    }

    const result = await sendLineNotification(
      condition.user_id,
      `【トレマチ】条件「${condition.keyword}」に合う交換情報が見つかりました。\nアプリを開いて内容を確認してください。`,
    );
    if (result.ok) notified += 1;
  }

  return { notified, status: 200 };
}

export async function POST(request: Request) {
  const { itemId } = await request.json();
  if (typeof itemId !== 'string') {
    return NextResponse.json({ error: 'itemId is required.' }, { status: 400 });
  }

  const result = await notifyForItem(itemId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ notified: result.notified });
}
