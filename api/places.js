import { db } from './_lib.js'

export default async function handler(req, res) {
  try {
    const data = await db(
      'places?select=id,name,category,cuisine,district,hours,lat,lng,address,photo_url,menu_url&is_active=eq.true&order=id'
    )
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
    return res.status(200).json(data)
  } catch {
    return res.status(500).json({ ok: false })
  }
}