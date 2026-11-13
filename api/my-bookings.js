import { deliverFor } from './_delivery.js'
import { db, verifyInitData } from './_lib.js'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false })
  const { action, initData, bookingId, offset = 0 } = req.body || {}
  const user = verifyInitData(initData)
  if (!user || !Number.isSafeInteger(Number(user.id))) return res.status(401).json({ ok: false })
  const userId = Number(user.id)
  try {
    if (action === 'list') {
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000) return res.status(400).json({ ok: false })
      const rows = await db('rpc/poimo_guest_bookings_v2', {
        method: 'POST', body: JSON.stringify({ p_user_id: userId, p_offset: offset }),
      })
      return res.status(200).json({ ok: true, bookings: rows.slice(0, 50), hasMore: rows.length > 50 })
    }
    if (action !== 'cancel' || !Number.isSafeInteger(Number(bookingId)) || Number(bookingId) < 1) {
      return res.status(400).json({ ok: false })
    }
    const rows = await db('rpc/poimo_guest_cancel_delivery', {
      method: 'POST', body: JSON.stringify({ p_user_id: userId, p_booking_id: Number(bookingId) }),
    })
    if (!rows.length) return res.status(409).json({ ok: false })
    const b = rows[0]
    const deliveryStatus = await deliverFor(b.id, 'cancelled_guest')
    return res.status(200).json({ ok: true, notified: deliveryStatus === 'sent', deliveryStatus })
  } catch {
    return res.status(500).json({ ok: false })
  }
}
