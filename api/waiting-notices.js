import crypto from 'node:crypto'
import { db } from './_lib.js'

export const config = { maxDuration: 60 }
export function waitingMessage(booking) {
  return `Заклад поки не відповів ⏳\n\nЗаявка №${booking.id}\nЗаклад: ${booking.place_name}\nДата: ${booking.booking_date}\nЧас: ${String(booking.booking_time).slice(0, 5)} (Київ)\n\nМинуло понад 15 хвилин, а підтвердження ще немає. Це повідомлення не означає відмову або скасування.\n\nПеревірте актуальний статус у «Моїх бронюваннях». Можна зачекати або скасувати заявку й обрати інший заклад.`
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false })
  const expected = process.env.REMINDER_SECRET
  const a = Buffer.from(`Bearer ${expected || ''}`)
  const b = Buffer.from(String(req.headers.authorization || ''))
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ ok: false })
  try {
    const rows = await db('rpc/poimo_claim_waiting_notices', { method: 'POST', body: '{}' })
    let sent = 0
    for (const booking of rows) {
      // Status can change after the atomic claim. Never change booking status here.
      const current = (await db(`bookings?id=eq.${booking.id}&status=eq.new&select=id`))[0]
      let state = 'skipped'
      if (current) {
        state = 'unknown'
        try {
          const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
            body: JSON.stringify({
              chat_id: booking.client_tg_id, text: waitingMessage(booking),
              reply_markup: { inline_keyboard: [[{ text: 'Відкрити «Поїмо»', web_app: { url: 'https://booking-app-pearl-iota.vercel.app/' } }]] },
            }),
          })
          state = response.ok && (await response.json()).ok === true ? 'sent' : 'failed'
        } catch { /* Delivery is uncertain; never resend automatically. */ }
      }
      await db(`bookings?id=eq.${booking.id}`, {
        method: 'PATCH', body: JSON.stringify({ waiting_notice_state: state,
          ...(state === 'sent' ? { waiting_notice_sent_at: new Date().toISOString() } : {}) }),
      })
      if (state === 'sent') sent++
    }
    return res.status(200).json({ ok: true, processed: rows.length, sent })
  } catch { return res.status(500).json({ ok: false }) }
}
