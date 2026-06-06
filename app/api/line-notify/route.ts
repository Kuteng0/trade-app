import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { to, messageText } = await request.json();
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!lineToken) {
      return NextResponse.json({ error: 'LINE_CHANNEL_ACCESS_TOKEN が設定されていません。' }, { status: 500 });
    }

    // LINE Messaging API - Push Message エンドポイント
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lineToken}`,
      },
      body: JSON.stringify({
        to: to,
        messages: [
          {
            type: 'text',
            text: messageText,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return NextResponse.json({ error: 'LINE送信失敗', details: errBody }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LINE通知の送信中にエラーが発生しました。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}