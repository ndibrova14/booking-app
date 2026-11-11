import { db, tg, verifyInitData } from './_lib.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const PHONE_RE = /^[+\d\s()-]{5,20}$/

function kyivDate(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(
    new Date(Date.now() + offsetDays * 86400000)
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false })
  }

  const { placeId, date, time, guests, name, phone, initData } = req.body || {}

  // 1. Запит має прийти з Mini App всередині Telegram
  const user = verifyInitData(initData)
  if (!user || !Number.isInteger(Number(user.id))) {
    return res.status(401).json({ ok: false })
  }
  const userId = Number(user.id)

  // 2. Перевірка введених даних
  const pid = Number(placeId)
  const g = Number(guests)
  const cleanName = String(name || '').trim()
  const cleanPhone = String(phone || '').trim()

  if (
    !Number.isInteger(pid) ||
    !DATE_RE.test(String(date)) ||
    !TIME_RE.test(String(time)) ||
    !Number.isInteger(g) || g < 1 || g > 20 ||
    cleanName.length < 1 || cleanName.length > 80 ||
    !PHONE_RE.test(cleanPhone) ||
    date < kyivDate(0) || date > kyivDate(120)
  ) {
    return res.status(400).json({ ok: false })
  }

  try {
    // 3. Ліміт: не більше 5 заявок на годину від одного користувача
    const since = new Date(Date.now() - 3600000).toISOString()
    const recent = await db(
      `bookings?client_tg_id=eq.${userId}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=5`
    )
    if (recent.length >= 5) {
      return res.status(429).json({ ok: false })
    }

    const places = await db(
      `places?id=eq.${pid}&is_active=eq.true&select=id,name,admin_chat_id`
    )
    const place = places?.[0]
    if (!place) return res.status(404).json({ ok: false })

    const tgUser = `${user.first_name || ''}${user.username ? ' @' + user.username : ''}`.trim()

    const rows = await db('bookings', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        place_id: place.id,
        place_name: place.name,
        booking_date: date,
        booking_time: time,
        guests: g,
        client_name: cleanName,
        client_phone: cleanPhone,
        client_tg_id: userId,
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
      `Ім'я: ${cleanName}\n` +
      `Телефон: ${cleanPhone}\n` +
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