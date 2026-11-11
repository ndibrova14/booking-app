import crypto from 'node:crypto'

export async function db(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    ...options.headers,
  }
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`

  const base = new URL(process.env.SUPABASE_URL.trim()).origin
  const r = await fetch(`${base}/rest/v1/${path}`, { ...options, headers })
  const text = await r.text()

  if (!r.ok) throw new Error(`db ${r.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

export async function tg(method, body) {
  return fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Перевіряє підпис initData від Telegram. Повертає дані користувача або null.
export function verifyInitData(initData, maxAgeSec = 86400) {
  if (!initData || typeof initData !== 'string') return null

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')

  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(process.env.BOT_TOKEN)
    .digest()
  const calc = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')

  const a = Buffer.from(calc, 'hex')
  const b = Buffer.from(hash, 'hex')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  const authDate = Number(params.get('auth_date'))
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null

  try {
    return JSON.parse(params.get('user'))
  } catch {
    return null
  }
}