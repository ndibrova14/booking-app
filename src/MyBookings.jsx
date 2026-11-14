import { useCallback, useEffect, useState } from 'react'
import ScreenIcon from './ScreenIcon.jsx'

const LABELS = { new: 'Очікує підтвердження', confirmed: 'Підтверджено', rejected: 'Відхилено', cancelled: 'Скасовано' }
async function api(body) {
  const response = await fetch('/api/my-bookings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, initData: window.Telegram?.WebApp?.initData || '' }),
  })
  if (!response.ok) throw new Error(String(response.status))
  return response.json()
}
export default function MyBookings({ onBack, previewBookings = null }) {
  const isPreview = Array.isArray(previewBookings)
  const [bookings, setBookings] = useState(() => isPreview ? previewBookings : [])
  const [loading, setLoading] = useState(!isPreview)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState(null)
  const inTelegram = Boolean(window.Telegram?.WebApp?.initData)
  const load = useCallback(async () => {
    try {
      const data = await api({ action: 'list' })
      setBookings(data.bookings)
      setHasMore(data.hasMore)
      setError('')
    } catch (e) {
      setError(e.message === '401' ? 'Відкрийте застосунок заново через Telegram.' : 'Не вдалося завантажити бронювання. Спробуйте ще раз.')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => {
    if (!inTelegram || isPreview) return
    const initial = setTimeout(load, 0)
    const timer = setInterval(load, 30000)
    return () => { clearTimeout(initial); clearInterval(timer) }
  }, [load, inTelegram, isPreview])
  async function cancel(id) {
    if (busy || isPreview) return
    setBusy(true)
    setNotice('')
    try {
      const result = await api({ action: 'cancel', bookingId: id })
      setNotice(result.notified ? 'Бронювання скасовано. Заклад повідомлено.' : ['queued', 'processing'].includes(result.deliveryStatus) ? 'Бронювання скасовано. Повідомлення закладу ще доставляється; повторювати скасування не потрібно.' : 'Бронювання скасовано, але доставку повідомлення закладу не підтверджено. За потреби зв’яжіться із закладом.')
      setConfirmId(null)
      await load()
    } catch (e) {
      setError(e.message === '409' ? 'Статус уже змінився або час бронювання минув. Оновіть список.' : 'Не вдалося підтвердити скасування. Оновіть список перед повторною спробою.')
    } finally { setBusy(false) }
  }
  async function more() {
    if (isPreview) return
    setBusy(true)
    try {
      const result = await api({ action: 'list', offset: bookings.length })
      setBookings((old) => [...old, ...result.bookings.filter((b) => !old.some((x) => x.id === b.id))])
      setHasMore(result.hasMore)
    } catch { setError('Не вдалося завантажити наступні записи.') }
    finally { setBusy(false) }
  }
  return <div className="app my-bookings">
    <header className="bookings-page-header"><p className="bookings-eyebrow">Поїмо · Київ</p><div className="topbar"><h1>Мої бронювання</h1>{inTelegram && !isPreview && <button className="refresh-bookings" aria-label="Оновити бронювання" disabled={busy || loading} onClick={() => { setLoading(true); load() }}><ScreenIcon name="refresh" /></button>}</div><p className="bookings-subtitle">Ваші плани та історія відвідувань</p></header>
    {isPreview && <p className="bookings-demo-note" role="status">Демонстраційні записи. Вони не є справжніми бронюваннями.</p>}
    {!inTelegram && !isPreview ? <div className="bookings-empty"><span className="booking-empty-symbol"><ScreenIcon name="calendar" /></span><h2>Ваші плани — тут</h2><p>Відкрийте «Поїмо» через Telegram, щоб бачити свої бронювання.</p><button className="book" onClick={onBack}>Знайти заклад</button></div> : <>
      {loading && <p className="bookings-feedback" role="status">Завантажуємо ваші бронювання…</p>}
      {error && <div className="bookings-feedback error" role="alert"><p>{error}</p><button className="menu-btn" disabled={busy || loading} onClick={() => { setLoading(true); load() }}>Спробувати ще раз</button></div>}
      {notice && <p className="bookings-feedback" role="status">{notice}</p>}
      {!loading && !error && bookings.length === 0 && <div className="bookings-empty"><span className="booking-empty-symbol"><ScreenIcon name="calendar" /></span><h2>Поки без планів?</h2><p>Знайдіть місце до смаку — ваше бронювання з’явиться тут.</p><button className="book" onClick={onBack}>Обрати заклад</button></div>}
      {bookings.map((b) => <article className={`card guest-booking-card booking-${b.status}`} key={b.id}><div className="card-body">
        <div className="booking-card-heading"><span className="booking-symbol"><ScreenIcon name="calendar" /></span><div><span className={`badge st-${b.status}`}>{LABELS[b.status] || 'Статус уточнюється'}</span><h2>{b.place_name}</h2><span className="booking-city">Київ</span></div></div>
        <dl className="booking-summary"><div><dt><ScreenIcon name="calendar" />Дата</dt><dd>{b.booking_date.split('-').reverse().join('.')}</dd></div><div><dt><ScreenIcon name="clock" />Час</dt><dd>{String(b.booking_time).slice(0, 5)}</dd></div><div><dt><ScreenIcon name="guests" />Гостей</dt><dd>{b.guests}</dd></div></dl>
        {b.status === 'confirmed' && b.reminder_enabled && b.can_cancel && <p className="booking-note">Нагадування в Telegram увімкнене.</p>}
        {b.status === 'new' && (b.waiting_long ? <div className="waiting-notice"><strong>Заклад поки не відповів</strong><p>Минуло понад 15 хвилин. Бронювання ще не підтверджене. Можна зачекати або скасувати заявку й обрати інший заклад.</p><button type="button" className="menu-btn" onClick={onBack}>До каталогу</button></div> : <p className="booking-note">{b.can_cancel ? 'Очікуємо рішення закладу. Це ще не підтверджена бронь. Якщо відповіді не буде понад 15 хвилин, повідомимо в Telegram; перевірка виконується кожні 5 хвилин.' : 'Час цієї непідтвердженої заявки минув.'}</p>)}
        {b.can_cancel && (confirmId === b.id ? <div className="cancel-confirm" role="group" aria-label="Підтвердження скасування">
          <p>Скасувати це бронювання?</p>
          <div className="actions"><button className="menu-btn" disabled={busy || isPreview} onClick={() => setConfirmId(null)}>Залишити</button><button className="cancel-confirm-button" disabled={busy || isPreview} onClick={() => cancel(b.id)}>{busy ? 'Скасовуємо…' : 'Так, скасувати'}</button></div>
        </div> : <button className="menu-btn cancel-booking" disabled={busy || isPreview} onClick={() => setConfirmId(b.id)}>Скасувати {b.status === 'new' ? 'заявку' : 'бронювання'}</button>)}
      </div></article>)}
      {hasMore && <button className="menu-btn" disabled={busy} onClick={more}>Показати ще</button>}
    </>}
  </div>
}
