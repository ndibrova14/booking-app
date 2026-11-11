import { db } from './_lib.js'

export default async function handler(req, res) {
  try {
    const data = await db(
      'places?select=id,name,category,cuisine,district,hours&is_active=eq.true&order=id'
    )
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
    return res.status(200).json(data)
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message) })
  }
}