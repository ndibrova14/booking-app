import { db, tg, verifyInitData } from './_lib.js'

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

const MESSAGES = {
  confirmed: 'Ваше бронювання підтверджено ✅',
  rejected: 'На жаль, заклад не може прийняти цю бронь ❌',
  cancelled: 'На жаль, заклад скасував вашу бронь. Зв’яжіться із закладом або оберіть інший час.',
}

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
          `&select=id,place_id,place_name,booking_date,booking_time,guests,client_name,client_phone,client_tg_name,status`
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
          body: JSON.stringify({ status, status_actor_id: userId, status_source: 'restaurant' }),
        }
      )
      if (!rows.length) return res.status(409).json({ ok: false })

      const b = rows[0]
      if (b.client_tg_id) {
        await tg('sendMessage', {
          chat_id: b.client_tg_id,
          text:
            `${MESSAGES[status]}\n\n` +
            `Заклад: ${b.place_name}\n` +
            `Дата: ${b.booking_date}\n` +
            `Час: ${String(b.booking_time).slice(0, 5)}\n` +
            `Гостей: ${b.guests}\n` +
            `Ім'я: ${b.client_name}`,
        })
      }
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ ok: false })
  } catch {
    return res.status(500).json({ ok: false })
  }
}