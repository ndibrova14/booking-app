import { db, tg, verifyInitData } from './_lib.js'

const REQUEST_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const PHONE_RE = /^\+[1-9]\d{7,14}$/

function kyivDate(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(
    new Date(Date.now() + offsetDays * 86400000)
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false })
  }

  const { placeId, date, time, guests, name, phone, initData, requestId } = req.body || {}

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
  const rawPhone = String(phone || '').trim()
  const digits = rawPhone.replace(/[\s()-]/g, '')
  const cleanPhone = /^0\d{9}$/.test(digits) ? `+38${digits}` : digits
  const parsedDate = new Date(`${date}T12:00:00Z`)
  const nowKyiv = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date())

  if (
    !Number.isInteger(pid) || pid < 1 ||
    !DATE_RE.test(String(date)) ||
    !TIME_RE.test(String(time)) ||
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date ||
    (date === kyivDate(0) && time <= nowKyiv) ||
    !/^[+\d\s()-]+$/.test(rawPhone) ||
    !Number.isInteger(g) || g < 1 || g > 20 ||
    cleanName.length < 1 || cleanName.length > 80 ||
    !PHONE_RE.test(cleanPhone) ||
    date < kyivDate(0) || date > kyivDate(120)
  ) {
    return res.status(400).json({ ok: false })
  }

  const requestKey = requestId || null
  if (requestKey && !REQUEST_RE.test(requestKey)) {
    return res.status(400).json({ ok: false })
  }
  const lookup = () => db(`bookings?client_tg_id=eq.${userId}&request_id=eq.${requestKey}&select=*`)
  const replyExisting = (booking) => {
    if (Number(booking.place_id) !== pid || booking.booking_date !== date ||
        String(booking.booking_time).slice(0, 5) !== time || booking.guests !== g ||
        booking.client_name !== cleanName || booking.client_phone !== cleanPhone) {
      return res.status(409).json({ ok: false })
    }
    return res.status(200).json({ ok: true, bookingId: booking.id,
      notificationStatus: booking.notification_status || 'unknown' })
  }

  try {
    if (requestKey) {
      const existing = (await lookup())[0]
      if (existing) return replyExisting(existing)
    }
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

    let rows
    try {
      rows = await db('bookings', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        request_id: requestKey,
        notification_status: 'pending',
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
    } catch (err) {
      // A concurrent request may already have inserted this request key.
      if (requestKey) {
        const existing = (await lookup())[0]
        if (existing) return replyExisting(existing)
      }
      throw err
    }
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

    let notificationStatus = 'unknown'
    try {
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

    const result = await r.json()
    notificationStatus = r.ok && result.ok === true ? 'sent' : 'failed'
    } catch {
      // Delivery may have succeeded before the connection was lost. Do not resend blindly.
      notificationStatus = 'unknown'
    }
    try {
      await db(`bookings?id=eq.${booking.id}`, {
        method: 'PATCH', body: JSON.stringify({ notification_status: notificationStatus }),
      })
    } catch {
      console.error('booking_notification_status_write_failed', booking.id)
    }
    return res.status(200).json({ ok: true, bookingId: booking.id, notificationStatus })
  } catch {
    return res.status(500).json({ ok: false })
  }
}