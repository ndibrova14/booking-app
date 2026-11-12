import { useState, useEffect, useCallback } from 'react'
import PlaceEditor from './PlaceEditor.jsx'
import Statistics from './Statistics.jsx'

const TABS = [
  { id: 'new', label: 'Нові' },
  { id: 'upcoming', label: 'Найближчі' },
  { id: 'archive', label: 'Архів' },
]

const STATUS_LABEL = {
  new: 'Нова',
  confirmed: 'Підтверджено',
  rejected: 'Відхилено',
  cancelled: 'Скасовано',
}

async function api(body) {
  const initData = window.Telegram?.WebApp?.initData || ''
  const r = await fetch('/api/cabinet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, initData }),
  })
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
}

function todayKyiv() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date())
}

export default function Cabinet({ onBack, onPlaceSaved }) {
  const [section, setSection] = useState('bookings')
  const [tab, setTab] = useState('new')
  const [places, setPlaces] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      const d = await api({ action: 'list' })
      setPlaces(d.places)
      setBookings(d.bookings)
      setError('')
    } catch {
      setError('Не вдалося завантажити заявки.')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (section !== 'bookings') return
    const initial = setTimeout(load, 0)
    const timer = setInterval(load, 30000)
    return () => { clearTimeout(initial); clearInterval(timer) }
  }, [load, section])

  async function changeStatus(id, status) {
    setBusyId(id)
    let message = ''
    try {
      await api({ action: 'status', bookingId: id, status })
    } catch (e) {
      message =
        e.message === '409'
          ? 'Цю заявку вже змінено. Список оновлено.'
          : 'Не вдалося змінити статус. Спробуйте ще раз.'
    }
    await load()
    setError(message)
    setBusyId(null)
  }

  const today = todayKyiv()
  const isUpcoming = (b) => b.status === 'confirmed' && b.booking_date >= today

  const filtered = bookings.filter((b) => {
    if (tab === 'new') return b.status === 'new'
    if (tab === 'upcoming') return isUpcoming(b)
    return b.status !== 'new' && !isUpcoming(b)
  })
  const list = tab === 'archive' ? [...filtered].reverse() : filtered

  const newCount = bookings.filter((b) => b.status === 'new').length

  if (section === 'stats') return <Statistics onBack={() => setSection('bookings')} onExit={onBack} />
  if (section === 'place') return <PlaceEditor onBack={() => setSection('bookings')} onExit={onBack} onSaved={onPlaceSaved} />

  return (
    <div className="app">
      <button className="back" onClick={onBack}>← До каталогу</button>
<h1>Кабінет</h1>
      <div className="collection-tabs cabinet-sections"><button className="active" aria-pressed="true">Бронювання</button><button aria-pressed="false" onClick={() => setSection('place')}>Мій заклад</button><button aria-pressed="false" onClick={() => setSection('stats')}>Статистика</button></div>
      {places.length === 1 && <p className="hint left">{places[0].name}</p>}

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'new' && newCount > 0 ? ` (${newCount})` : ''}
          </button>
        ))}
      </div>

      {error && <p className="hint">{error}</p>}
      {loading && <p>Завантаження…</p>}
      {!loading && list.length === 0 && <p className="hint">Тут поки нічого немає</p>}

      {list.map((b) => (
        <div className="card" key={b.id}>
          <div className="card-body">
            <div className="card-top">
              <h3>
                {b.booking_date.split('-').reverse().join('.')} · {String(b.booking_time).slice(0, 5)}
              </h3>
              <span className={`badge st-${b.status}`}>
                {STATUS_LABEL[b.status] || b.status}
              </span>
            </div>
            {places.length > 1 && <p>{b.place_name}</p>}
            <p>{b.guests} гост. · {b.client_name}</p>
            <p>
              <a href={`tel:${b.client_phone.replace(/[^\d+]/g, '')}`}>{b.client_phone}</a>
            </p>
            {b.client_tg_name && <p>{b.client_tg_name}</p>}

            {b.status === 'new' && (
              <div className="actions">
                <button
                  className="menu-btn"
                  disabled={busyId === b.id}
                  onClick={() => changeStatus(b.id, 'rejected')}
                >
                  Відхилити
                </button>
                <button
                  className="book"
                  disabled={busyId === b.id}
                  onClick={() => changeStatus(b.id, 'confirmed')}
                >
                  Підтвердити
                </button>
              </div>
            )}

            {isUpcoming(b) && (
              <div className="actions">
                <button
                  className="menu-btn"
                  disabled={busyId === b.id}
                  onClick={() => changeStatus(b.id, 'cancelled')}
                >
                  Скасувати бронь
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}