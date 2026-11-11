import { db, tg } from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false })
  }

  const { placeId, date, time, guests, name, phone, tgUser, tgUserId } = req.body || {}
  const g = Number(guests)
  const pid = Number(placeId)

  if (
    !Number.isInteger(pid) || !date || !time || !name || !phone ||
    !(g >= 1 && g <= 20) || String(name).length > 80 || String(phone).length > 30
  ) {
    return res.status(400).json({ ok: false })
  }

  try {
    const places = await db(
      `places?id=eq.${pid}&is_active=eq.true&select=id,name,admin_chat_id`
    )
    const place = places?.[0]
    if (!place) return res.status(404).json({ ok: false })

    const rows = await db('bookings', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        place_id: place.id,
        place_name: place.name,
        booking_date: date,
        booking_time: time,
        guests: g,
        client_name: String(name),
        client_phone: String(phone),
        client_tg_id: Number(tgUserId) || null,
        client_tg_name: tgUser || null,
      }),
    })
    const booking = rows[0]

    const text =
      `Нова заявка на бронювання\n\n` +
      `Заклад: ${place.name}\n` +
      `Дата: ${date}\n` +
      `Час: ${time}\n` +
      `Гостей: ${g}\n` +
      `Ім'я: ${name}\n` +
      `Телефон: ${phone}\n` +
      (tgUser ? `Telegram: ${tgUser}\n` : '')

    const r = await tg('sendMessage', {
      chat_id: place.admin_chat_id || process.env.ADMIN_CHAT_ID,
      text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Підтвердити', callback_data: `ok:${booking.id}` },
            { text: '❌ Відхилити', callback_data: `no:${booking.id}` },
          ],
        ],
      },
    })

    if (!r.ok) return res.status(502).json({ ok: false })
    return res.status(200).json({ ok: true })
  } catch {
    return res.status(500).json({ ok: false })
  }
}