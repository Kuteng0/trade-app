import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { category, content, senderName, senderLineId, createdAt } = await request.json();
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const adminLineUserId = process.env.ADMIN_LINE_USER_ID;

    if (!lineToken || !adminLineUserId) {
      return NextResponse.json({ error: 'LINE feedback notification is not configured.' }, { status: 500 });
    }

    const messageText = [
      '【トレマチ】新しいフィードバックが届きました。',
      `カテゴリ: ${category || '未指定'}`,
      `送信者: ${senderName || '不明'}`,
      `LINE ID: ${senderLineId || '不明'}`,
      `日時: ${createdAt || new Date().toISOString()}`,
      '',
      content || '(本文なし)',
    ].join('\n');

    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lineToken}`,
      },
      body: JSON.stringify({
        to: adminLineUserId,
        messages: [{ type: 'text', text: messageText }],
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      return NextResponse.json({ error: 'LINEフィードバック通知に失敗しました。', details }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected LINE feedback error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
