import { db, verifyInitData } from './_lib.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false })
  const { action, initData, placeId, saved, offset = 0 } = req.body || {}
  const user = verifyInitData(initData)
  if (!user || !Number.isSafeInteger(Number(user.id)) || Number(user.id) < 1) {
    return res.status(401).json({ ok: false })
  }
  const userId = Number(user.id)
  try {
    if (action === 'list') {
      if (!Number.isSafeInteger(offset) || offset < 0) return res.status(400).json({ ok: false })
      const rows = await db(`favorites?client_tg_id=eq.${userId}&select=place_id&order=place_id&offset=${offset}&limit=501`)
      return res.status(200).json({ ok: true, ids: rows.slice(0, 500).map((r) => r.place_id), hasMore: rows.length > 500 })
    }
    const pid = Number(placeId)
    if (action !== 'set' || typeof saved !== 'boolean' || !Number.isSafeInteger(pid) || pid < 1) {
      return res.status(400).json({ ok: false })
    }
    if (saved) {
      const places = await db(`places?id=eq.${pid}&is_active=eq.true&select=id`)
      if (!places.length) return res.status(404).json({ ok: false })
      await db('favorites?on_conflict=client_tg_id,place_id', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ client_tg_id: userId, place_id: pid }),
      })
    } else {
      await db(`favorites?client_tg_id=eq.${userId}&place_id=eq.${pid}`, { method: 'DELETE' })
    }
    return res.status(200).json({ ok: true, saved })
  } catch { return res.status(500).json({ ok: false }) }
}
