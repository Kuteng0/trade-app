import { sendLineNotification } from '@/lib/line';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { to, messageText } = await request.json();
    const result = await sendLineNotification(to, messageText);

    if (!result.ok) {
      console.error('LINE notification failed:', { status: result.status, body: result.body });
      return NextResponse.json({ error: 'LINE送信失敗' }, { status: result.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LINE通知の送信中にエラーが発生しました。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
