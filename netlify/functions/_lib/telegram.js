// Telegram 发送：sendPhoto（multipart，含 base64 内嵌报头图）/ sendMessage（纯文本兜底）

export async function sendPhoto(photoBytes, caption, env, contentType = "image/png") {
  const api = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`;
  const form = new FormData();
  form.append("chat_id", env.TELEGRAM_CHANNEL_ID);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append("photo", new Blob([photoBytes], { type: contentType }), "cover.jpg");
  const resp = await fetch(api, { method: "POST", body: form });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 180)}`);
  return resp.json();
}

export async function sendMessage(text, env) {
  const api = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const resp = await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHANNEL_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 180)}`);
}
