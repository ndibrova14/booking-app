import { useState } from 'react'
import './App.css'

const CATEGORIES = ['Усі', 'Ресторани', 'Кафе', 'Кальян-бари']

const PLACES = [
  { id: 1, name: 'Trattoria Roma', category: 'Ресторани', cuisine: 'Італійська', district: 'Печерськ', hours: '12:00–23:00' },
  { id: 2, name: 'Sakura Sushi', category: 'Ресторани', cuisine: 'Японська', district: 'Лівобережна', hours: '11:00–23:00' },
  { id: 3, name: 'Грузинський дворик', category: 'Ресторани', cuisine: 'Грузинська', district: 'Липки', hours: '11:00–00:00' },
  { id: 4, name: 'Кава & Книги', category: 'Кафе', cuisine: 'Кава, десерти', district: 'Хрещатик', hours: '08:00–21:00' },
  { id: 5, name: 'Morning Bean', category: 'Кафе', cuisine: 'Сніданки', district: 'Поділ', hours: '07:30–18:00' },
  { id: 6, name: 'Cloud 9 Lounge', category: 'Кальян-бари', cuisine: 'Кальян, коктейлі', district: 'Поділ', hours: '16:00–02:00' },
  { id: 7, name: 'Smoke & Chill', category: 'Кальян-бари', cuisine: 'Кальян, чай', district: 'Оболонь', hours: '15:00–03:00' },
]

function App() {
  const [category, setCategory] = useState('Усі')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [sent, setSent] = useState(false)

  const visible = PLACES.filter(
    (p) =>
      (category === 'Усі' || p.category === category) &&
      p.name.toLowerCase().includes(query.toLowerCase())
  )

  function closeModal() {
    setSelected(null)
    setSent(false)
  }

  function handleSubmit(e) {
    e.preventDefault()
    setSent(true)
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

      {visible.length === 0 && <p>Нічого не знайдено</p>}

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
                <input type="date" required />
                <input type="time" required />
                <input type="number" min="1" max="20" placeholder="Кількість людей" required />
                <input placeholder="Ім'я" required />
                <input type="tel" placeholder="Телефон" required />
                <button className="book" type="submit">Надіслати заявку</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App