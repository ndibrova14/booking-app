import { db, tg } from './_lib.js'

// Адреса застосунку. Коли з'явиться власний домен, змініть тут
const APP_URL = 'https://booking-app-pearl-iota.vercel.app/'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) {
    return res.status(401).end()
  }

  // Звичайні повідомлення: /start та /id
  const msg = req.body?.message
  if (msg?.text && msg.chat?.type === 'private') {
    const command = msg.text.trim().split(/[\s@]/)[0]

    try {
      if (command === '/start') {
        await tg('sendMessage', {
          chat_id: msg.chat.id,
          text:
            'Привіт! Це «Поїмо»: кафе, ресторани й кальян-бари Києва та бронювання столика без дзвінків.\n\n' +
            'Натисніть кнопку нижче, щоб відкрити каталог.',
          reply_markup: {
            inline_keyboard: [[{ text: 'Відкрити каталог', web_app: { url: APP_URL } }]],
          },
        })
      } else if (command === '/id') {
        await tg('sendMessage', {
          chat_id: msg.chat.id,
          text: `Ваш Telegram ID: ${msg.from.id}`,
        })
      }
    } catch {
      // повідомлення не критичне
    }
    return res.status(200).end()
  }

  const cb = req.body?.callback_query
  if (!cb) return res.status(200).end()

  const answer = (text) =>
    tg('answerCallbackQuery', { callback_query_id: cb.id, ...(text ? { text } : {}) })

  try {
    const [action, idStr] = (cb.data || '').split(':')
    const id = Number(idStr)
    if (!['ok', 'no'].includes(action) || !Number.isInteger(id)) {
      await answer()
      return res.status(200).end()
    }

    const rows = await db(`bookings?id=eq.${id}&select=*,places(admin_chat_id)`)
    const b = rows?.[0]
    if (!b) {
      await answer('Бронь не знайдено')
      return res.status(200).end()
    }

    // Кнопки може натискати адміністратор цього закладу або головний адміністратор
    const allowed = [process.env.ADMIN_CHAT_ID, b.places?.admin_chat_id]
      .filter(Boolean)
      .map(String)
    if (!allowed.includes(String(cb.from.id))) {
      await answer()
      return res.status(200).end()
    }

    if (b.status !== 'new') {
      await answer('Цю заявку вже оброблено')
      return res.status(200).end()
    }

    const confirmed = action === 'ok'
    await db(`bookings?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: confirmed ? 'confirmed' : 'rejected' }),
    })

    await tg('editMessageText', {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: `${cb.message.text}\n\n${confirmed ? '✅ Підтверджено' : '❌ Відхилено'}`,
    })
    await answer(confirmed ? 'Підтверджено' : 'Відхилено')

    if (b.client_tg_id) {
      await tg('sendMessage', {
        chat_id: b.client_tg_id,
        text:
          (confirmed
            ? 'Ваше бронювання підтверджено ✅'
            : 'На жаль, заклад не може прийняти цю бронь ❌') +
          `\n\nЗаклад: ${b.place_name}\n` +
          `Дата: ${b.booking_date}\n` +
          `Час: ${String(b.booking_time).slice(0, 5)}\n` +
          `Гостей: ${b.guests}\n` +
          `Ім'я: ${b.client_name}`,
      })
    }
  } catch {
    // Telegram не повинен повторювати запит через нашу помилку
  }

  return res.status(200).end()
}