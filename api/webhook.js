const API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`

async function tg(method, body) {
  return fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Приймаємо запити лише від Telegram
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) {
    return res.status(401).end()
  }

  const cb = req.body?.callback_query
  if (!cb) return res.status(200).end()

  // Поки що кнопки може натискати лише адміністратор
  if (String(cb.from.id) !== String(process.env.ADMIN_CHAT_ID)) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id })
    return res.status(200).end()
  }

  const [action, clientId] = (cb.data || '').split(':')
  const confirmed = action === 'ok'
  const original = cb.message?.text || ''
  const details = original.split('\n\n').slice(1).join('\n\n')

  // Оновлюємо повідомлення закладу (кнопки зникають)
  await tg('editMessageText', {
    chat_id: cb.message.chat.id,
    message_id: cb.message.message_id,
    text: `${original}\n\n${confirmed ? '✅ Підтверджено' : '❌ Відхилено'}`,
  })

  await tg('answerCallbackQuery', {
    callback_query_id: cb.id,
    text: confirmed ? 'Підтверджено' : 'Відхилено',
  })

  // Повідомляємо клієнта
  if (clientId && clientId !== '0') {
    await tg('sendMessage', {
      chat_id: clientId,
      text:
        (confirmed
          ? 'Ваше бронювання підтверджено ✅'
          : 'На жаль, заклад не може прийняти цю бронь ❌') +
        '\n\n' +
        details,
    })
  }

  return res.status(200).end()
}