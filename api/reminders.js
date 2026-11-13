import { deliverFor } from './_delivery.js'
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
    const rows = await db('rpc/poimo_queue_reminders', { method: 'POST', body: '{}' })
    let sent = 0
    for (const booking of rows) {
      if(await deliverFor(booking.id, 'reminder')==='sent')sent++
    }
    return res.status(200).json({ ok: true, processed: rows.length, sent })
  } catch {
    return res.status(500).json({ ok: false })
  }
}
