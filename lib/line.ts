export async function sendLineNotification(to: string, text: string) {
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!lineToken) {
    return { ok: false, status: 500, body: 'LINE_CHANNEL_ACCESS_TOKEN が設定されていません。' };
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lineToken}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'text', text }],
    }),
  });

  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}
