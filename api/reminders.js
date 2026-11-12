import crypto from 'node:crypto'
import { db } from './_lib.js'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false })
  const expected = process.env.REMINDER_SECRET
  const supplied = String(req.headers.authorization || '')
  const a = Buffer.from(`Bearer ${expected || ''}`)
  const b = Buffer.from(supplied)
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false })
  }
  try {
    const rows = await db('rpc/poimo_claim_reminders', { method: 'POST', body: '{}' })
    let sent = 0
    for (const booking of rows) {
      // Check again: the guest or restaurant may have cancelled after claiming.
      const current = (await db(`bookings?id=eq.${booking.id}&status=eq.confirmed&reminder_enabled=eq.true&select=id`))[0]
      let state = 'skipped'
      if (current) {
        state = 'unknown'
        try {
          const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(8000),
            body: JSON.stringify({
            chat_id: booking.client_tg_id,
            text: `Нагадування від «Поїмо» 🍽\n\nВаша підтверджена бронь уже скоро.\nЗаклад: ${booking.place_name}\nДата: ${booking.booking_date}\nЧас: ${String(booking.booking_time).slice(0, 5)} (Київ)\nГостей: ${booking.guests}\n\nЯкщо плани змінилися, скасуйте бронь у розділі «Мої бронювання».`,
            }),
          })
          state = response.ok && (await response.json()).ok === true ? 'sent' : 'failed'
        } catch { /* Unknown delivery must not be retried blindly. */ }
      }
      await db(`bookings?id=eq.${booking.id}`, {
        method: 'PATCH', body: JSON.stringify({ reminder_state: state,
          ...(state === 'sent' ? { reminder_sent_at: new Date().toISOString() } : {}) }),
      })
      if (state === 'sent') sent++
    }
    return res.status(200).json({ ok: true, processed: rows.length, sent })
  } catch {
    return res.status(500).json({ ok: false })
  }
}
