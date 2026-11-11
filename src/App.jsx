import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

const CATEGORIES = ['Усі', 'Ресторани', 'Кафе', 'Кальян-бари']

function MapView({ places, onPick }) {
  const boxRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    const map = L.map(boxRef.current).setView([50.4501, 30.5234], 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    return () => map.remove()
  }, [])

  useEffect(() => {
    const layer = layerRef.current
    layer.clearLayers()
    const icon = L.divIcon({ className: 'pin', iconSize: [20, 20] })
    places
      .filter((p) => p.lat != null && p.lng != null)
      .forEach((p) => {
        L.marker([p.lat, p.lng], { icon })
          .on('click', () => onPick(p))
          .addTo(layer)
      })
  }, [places, onPick])

  return <div ref={boxRef} className="map" />
}

function App() {
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [view, setView] = useState('list')
  const [category, setCategory] = useState('Усі')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(null)
  const [selected, setSelected] = useState(null)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
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
            <div className="card" key={p.id}>
              <h3>{p.name}</h3>
              <p>{p.cuisine} · {p.district}</p>
              <p className="hours">{p.hours}</p>
              <button className="book" onClick={() => setSelected(p)}>
                Забронювати
              </button>
            </div>
          ))}
        </>
      )}

      {view === 'map' && !loading && !loadError && (
        <>
          <MapView places={visible} onPick={setPicked} />
          {pickedVisible ? (
            <div className="card">
              <h3>{pickedVisible.name}</h3>
              <p>{pickedVisible.cuisine} · {pickedVisible.district}</p>
              {pickedVisible.address && <p>{pickedVisible.address}</p>}
              <p className="hours">{pickedVisible.hours}</p>
              <button className="book" onClick={() => setSelected(pickedVisible)}>
                Забронювати
              </button>
            </div>
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
                <input name="date" type="date" required />
                <input name="time" type="time" required />
                <input name="guests" type="number" min="1" max="20" placeholder="Кількість людей" required />
                <input name="name" placeholder="Ім'я" required />
                <input name="phone" type="tel" placeholder="Телефон" required />
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