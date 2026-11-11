export async function db(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    ...options.headers,
  }
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`

  // Беремо лише початок адреси, навіть якщо у змінній є зайвий хвіст
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