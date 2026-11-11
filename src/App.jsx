import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

const CATEGORIES = ['Усі', 'Ресторани', 'Кафе', 'Кальян-бари']

// Повертає true/false, а якщо годин немає або формат незрозумілий, null
function isOpenNow(hours) {
  const m = /(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/.exec(hours || '')
  if (!m) return null

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const h = Number(parts.find((p) => p.type === 'hour').value) % 24
  const min = Number(parts.find((p) => p.type === 'minute').value)

  const now = h * 60 + min
  const open = Number(m[1]) * 60 + Number(m[2])
  const close = Number(m[3]) * 60 + Number(m[4])

  return open < close ? now >= open && now < close : now >= open || now < close
}

function MapView({ places, onPick }) {
  const boxRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    const map = L.map(boxRef.current).setView([50.4501, 30.5234], 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => map.remove()
  }, [])

  useEffect(() => {
    const layer = layerRef.current
    layer.clearLayers()
    const icon = L.divIcon({ className: 'pin', iconSize: [20, 20] })
    const withCoords = places.filter((p) => p.lat != null && p.lng != null)

    withCoords.forEach((p) => {
      L.marker([p.lat, p.lng], { icon })
        .on('click', () => onPick(p))
        .addTo(layer)
    })

    if (withCoords.length > 0) {
      mapRef.current.fitBounds(
        withCoords.map((p) => [p.lat, p.lng]),
        { padding: [30, 30], maxZoom: 15 }
      )
    }
  }, [places, onPick])

  return <div ref={boxRef} className="map" />
}

function PlaceCard({ place, onBook }) {
  const open = isOpenNow(place.hours)
  return (
    <div className="card">
      {place.photo_url && (
        <img
          className="photo"
          src={place.photo_url}
          alt={place.name}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      )}
      <div className="card-body">
        <div className="card-top">
          <h3>{place.name}</h3>
          {open !== null && (
            <span className={open ? 'badge open' : 'badge closed'}>
              {open ? 'Відкрито' : 'Зачинено'}
            </span>
          )}
        </div>
        <p>{place.cuisine} · {place.district}</p>
        {place.address && <p>{place.address}</p>}
        <p className="hours">{place.hours}</p>
        <button className="book" onClick={() => onBook(place)}>
          Забронювати
        </button>
      </div>
    </div>
  )
}

function App() {
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [view, setView] = useState('list')
  const [category, setCategory] = useState('Усі')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(null)
  const [selected, setSelected] = useState(null)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      const dark = tg.colorScheme === 'dark'
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      const bg = dark ? '#1c1917' : '#f7f2ec'
      try {
        tg.setHeaderColor(bg)
        tg.setBackgroundColor(bg)
      } catch {
        // старі версії Telegram цього не підтримують
      }
    }

    fetch('/api/places')
      .then((r) => {
        if (!r.ok) throw new Error('fail')
        return r.json()
      })
      .then(setPlaces)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  const visible = places.filter(
    (p) =>
      (category === 'Усі' || p.category === category) &&
      (!onlyOpen || isOpenNow(p.hours) === true) &&
      p.name.toLowerCase().includes(query.toLowerCase())
  )

  const pickedVisible = visible.find((p) => p.id === picked?.id)

  function closeModal() {
    setSelected(null)
    setSent(false)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setError('')

    const f = new FormData(e.target)
    const u = window.Telegram?.WebApp?.initDataUnsafe?.user
    const tgUser = u ? `${u.first_name || ''} ${u.username ? '@' + u.username : ''}`.trim() : ''
    const tgUserId = u?.id || 0

    try {
      const r = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: selected.id,
          date: f.get('date'),
          time: f.get('time'),
          guests: f.get('guests'),
          name: f.get('name'),
          phone: f.get('phone'),
          tgUser,
          tgUserId,
        }),
      })
      if (!r.ok) throw new Error('fail')
      setSent(true)
    } catch {
      setError('Не вдалося надіслати заявку. Спробуйте ще раз.')
    }
    setSending(false)
  }

  return (
    <div className="app">
      <h1>Заклади міста</h1>

      <input
        className="search"
        placeholder="Пошук за назвою"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="chips">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={c === category ? 'chip active' : 'chip'}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
        <button
          className={onlyOpen ? 'chip active' : 'chip'}
          onClick={() => setOnlyOpen(!onlyOpen)}
        >
          Відкрито зараз
        </button>
      </div>

      <div className="tabs">
        <button
          className={view === 'list' ? 'tab active' : 'tab'}
          onClick={() => setView('list')}
        >
          Список
        </button>
        <button
          className={view === 'map' ? 'tab active' : 'tab'}
          onClick={() => setView('map')}
        >
          Карта
        </button>
      </div>

      {loading && <p>Завантаження…</p>}
      {loadError && <p>Не вдалося завантажити заклади. Спробуйте пізніше.</p>}

      {view === 'list' && (
        <>
          {!loading && !loadError && visible.length === 0 && <p>Нічого не знайдено</p>}
          {visible.map((p) => (
            <PlaceCard key={p.id} place={p} onBook={setSelected} />
          ))}
        </>
      )}

      {view === 'map' && !loading && !loadError && (
        <>
          <MapView places={visible} onPick={setPicked} />
          {pickedVisible ? (
            <PlaceCard place={pickedVisible} onBook={setSelected} />
          ) : (
            <p className="hint">Натисніть на точку на карті, щоб побачити заклад</p>
          )}
        </>
      )}

      {selected && (
        <div className="overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{selected.name}</h2>
            {sent ? (
              <>
                <p>Заявку надіслано! Заклад підтвердить бронь.</p>
                <button className="book" onClick={closeModal}>Закрити</button>
              </>
            ) : (
              <form onSubmit={handleSubmit}>
                <label className="field">
                  <span>Дата</span>
                  <input name="date" type="date" min={today} required />
                </label>
                <label className="field">
                  <span>Час</span>
                  <input name="time" type="time" required />
                </label>
                <label className="field">
                  <span>Кількість людей</span>
                  <input
                    name="guests"
                    type="number"
                    min="1"
                    max="20"
                    inputMode="numeric"
                    placeholder="Наприклад, 2"
                    required
                  />
                </label>
                <label className="field">
                  <span>Ім'я</span>
                  <input name="name" placeholder="Як до вас звертатися" required />
                </label>
                <label className="field">
                  <span>Телефон</span>
                  <input name="phone" type="tel" placeholder="+380" required />
                </label>
                {error && <p>{error}</p>}
                <button className="book" type="submit" disabled={sending}>
                  {sending ? 'Надсилаємо…' : 'Надіслати заявку'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App