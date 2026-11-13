import crypto from 'node:crypto'
import { deliverFor } from './_delivery.js'
import { db, verifyInitData } from './_lib.js'

// Заклади, якими керує користувач. Власник (ADMIN_CHAT_ID) бачить усі.
async function managedPlaces(userId) {
  if (String(userId) === String(process.env.ADMIN_CHAT_ID)) {
    return db('places?select=id,name&order=id')
  }
  return db(`places?admin_chat_id=eq.${userId}&select=id,name&order=id`)
}

function kyivDate(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(
    new Date(Date.now() + offsetDays * 86400000)
  )
}

// Яким має бути поточний статус, щоб дозволити перехід
const RULES = { confirmed: 'new', rejected: 'new', cancelled: 'confirmed' }

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false })

  const { action, initData, bookingId, status } = req.body || {}

  const user = verifyInitData(initData)
  if (!user || !Number.isInteger(Number(user.id))) {
    return res.status(401).json({ ok: false })
  }
  const userId = Number(user.id)

  try {
    const places = await managedPlaces(userId)

    // Застосунок перевіряє, чи показувати кнопку «Кабінет»
    if (action === 'me') {
      return res.status(200).json({ ok: true, places })
    }

    if (!places.length) return res.status(403).json({ ok: false })
    const ids = places.map((p) => p.id).join(',')

    if (action === 'list') {
      const bookings = await db(
        `bookings?place_id=in.(${ids})&booking_date=gte.${kyivDate(-30)}` +
          `&order=booking_date.asc,booking_time.asc&limit=300` +
          `&select=id,place_id,place_name,booking_date,booking_time,guests,client_name,client_phone,client_tg_name,status,notification_status`
      )
      return res.status(200).json({ ok: true, places, bookings })
    }

    if (action === 'status') {
      const id = Number(bookingId)
      if (!Number.isInteger(id) || typeof status !== 'string' || !Object.hasOwn(RULES, status)) {
        return res.status(400).json({ ok: false })
      }

      // Змінюємо лише якщо статус ще такий, як очікуємо (захист від подвійного натискання)
      const rows = await db(
        `bookings?id=eq.${id}&place_id=in.(${ids})&status=eq.${RULES[status]}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ status, status_actor_id: userId, status_source: 'restaurant', delivery_event_nonce: crypto.randomUUID() }),
        }
      )
      if (!rows.length) return res.status(409).json({ ok: false })

      const b = rows[0]
      const deliveryStatus = await deliverFor(b.id, status === 'cancelled' ? 'cancelled_restaurant' : status)
      return res.status(200).json({ ok: true, deliveryStatus })
    }

    return res.status(400).json({ ok: false })
  } catch {
    return res.status(500).json({ ok: false })
  }
}