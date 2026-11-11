import { useState, useEffect } from 'react'
import './App.css'

const CATEGORIES = ['Усі', 'Ресторани', 'Кафе', 'Кальян-бари']

function App() {
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [category, setCategory] = useState('Усі')
  const [query, setQuery] = useState('')
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

      {loading && <p>Завантаження…</p>}
      {loadError && <p>Не вдалося завантажити заклади. Спробуйте пізніше.</p>}
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