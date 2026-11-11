export async function db(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    ...options.headers,
  }
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`

  const base = process.env.SUPABASE_URL.replace(/\/$/, '')
  const r = await fetch(`${base}/rest/v1/${path}`, { ...options, headers })
  if (!r.ok) throw new Error(`db ${r.status}`)

  const text = await r.text()
  return text ? JSON.parse(text) : null
}

export async function tg(method, body) {
  return fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}