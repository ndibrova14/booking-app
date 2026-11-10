export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false })
  }

  const { place, date, time, guests, name, phone, tgUser, tgUserId } = req.body || {}
  if (!place || !date || !time || !guests || !name || !phone) {
    return res.status(400).json({ ok: false })
  }

  const text =
    `Нова заявка на бронювання\n\n` +
    `Заклад: ${place}\n` +
    `Дата: ${date}\n` +
    `Час: ${time}\n` +
    `Гостей: ${guests}\n` +
    `Ім'я: ${name}\n` +
    `Телефон: ${phone}\n` +
    (tgUser ? `Telegram: ${tgUser}\n` : '')

  const clientId = Number(tgUserId) || 0

  const r = await fetch(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.ADMIN_CHAT_ID,
        text,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Підтвердити', callback_data: `ok:${clientId}` },
              { text: '❌ Відхилити', callback_data: `no:${clientId}` },
            ],
          ],
        },
      }),
    }
  )

  if (!r.ok) {
    return res.status(502).json({ ok: false })
  }
  return res.status(200).json({ ok: true })
}