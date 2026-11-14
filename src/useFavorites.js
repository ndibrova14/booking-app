import { useCallback, useEffect, useRef, useState } from 'react'

async function request(body, signal) {
  const response = await fetch('/api/favorites', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ ...body, initData: window.Telegram?.WebApp?.initData || '' }),
  })
  if (!response.ok) throw new Error(String(response.status))
  return response.json()
}
export default function useFavorites() {
  const isPreview = import.meta.env.VITE_DESIGN_PREVIEW === 'true'
  const enabled = isPreview || Boolean(window.Telegram?.WebApp?.initData)
  const [ids, setIds] = useState([])
  const [loading, setLoading] = useState(enabled && !isPreview)
  const [error, setError] = useState('')
  const [busyIds, setBusyIds] = useState([])
  const locks = useRef(new Set())
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!enabled || isPreview) return
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      try {
        const loaded = []
        let hasMore = true
        while (hasMore) {
          const result = await request({ action: 'list', offset: loaded.length }, controller.signal)
          loaded.push(...result.ids.map(String))
          hasMore = result.hasMore
        }
        if (!controller.signal.aborted) { setIds(loaded); setError('') }
      } catch {
        if (!controller.signal.aborted) setError('Не вдалося завантажити обране. Спробуйте ще раз.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    load()
    return () => controller.abort()
  }, [enabled, reload, isPreview])
  const retry = useCallback(() => setReload((n) => n + 1), [])
  async function toggle(placeId) {
    if (isPreview) {
      const key = String(placeId)
      setIds((old) => old.includes(key) ? old.filter((id) => id !== key) : [...old, key])
      return
    }
    if (!enabled) { setError('Відкрийте «Поїмо» через Telegram, щоб зберігати обране.'); return }
    const key = String(placeId)
    if (loading || error || locks.current.has(key)) return
    locks.current.add(key)
    setBusyIds([...locks.current])
    const saved = !ids.includes(key)
    // Update immediately; keep this place locked until its write completes.
    setIds((old) => saved ? [...new Set([...old, key])] : old.filter((id) => id !== key))
    try {
      await request({ action: 'set', placeId, saved })
    } catch {
      // Roll back only this place, preserving concurrent changes to other places.
      setIds((old) => saved ? old.filter((id) => id !== key) : [...new Set([...old, key])])
      setError('Не вдалося підтвердити зміну обраного. Оновіть обране перед повторною спробою.')
    } finally { locks.current.delete(key); setBusyIds([...locks.current]) }
  }
  return { ids, loading, error, busyIds, toggle, retry, enabled }
}
