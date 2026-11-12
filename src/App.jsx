import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import Cabinet from './Cabinet.jsx'
import MyBookings from './MyBookings.jsx'
import useFavorites from './useFavorites.js'
import FilterSheet from './FilterSheet.jsx'
import { filterOptions, emptyFilters, countFilters, filterPlaces } from './catalogFilters.js'

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

// Відстань між двома точками в кілометрах
function distanceKm(a, b) {
  const R = 6371
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

function formatDistance(km) {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} м`
  return `${km.toFixed(1).replace('.', ',')} км`
}

// Місцезнаходження: спершу через Telegram, інакше через браузер
function getUserLocation() {
  return new Promise((resolve, reject) => {
    const viaBrowser = () => {
      if (!navigator.geolocation) return reject(new Error('unsupported'))
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => reject(new Error('denied')),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      )
    }

    const tg = window.Telegram?.WebApp
    const lm = tg?.LocationManager
    if (lm && tg.isVersionAtLeast && tg.isVersionAtLeast('8.0')) {
      const ask = () => {
        if (!lm.isLocationAvailable) return viaBrowser()
        lm.getLocation((loc) => {
          if (loc) resolve({ lat: loc.latitude, lng: loc.longitude })
          else reject(new Error('denied'))
        })
      }
      if (lm.isInited) ask()
      else lm.init(ask)
    } else {
      viaBrowser()
    }
  })
}

function MapView({ places, me, onPick }) {
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

    if (me) {
      L.marker([me.lat, me.lng], {
        icon: L.divIcon({ className: 'pin me', iconSize: [20, 20] }),
        interactive: false,
        zIndexOffset: 1000,
      }).addTo(layer)
    }

    // З геолокацією показуємо вас і чотири найближчі заклади (список уже відсортований)
    const focus = me ? withCoords.slice(0, 4) : withCoords
    const points = focus.map((p) => [p.lat, p.lng])
    if (me) points.push([me.lat, me.lng])
    if (points.length > 0) {
      mapRef.current.fitBounds(points, { padding: [30, 30], maxZoom: 15 })
    }
  }, [places, me, onPick])

  return <div ref={boxRef} className="map" />
}

function openMenu(url) {
  const tg = window.Telegram?.WebApp
  if (tg?.openLink) tg.openLink(url)
  else window.open(url, '_blank', 'noopener')
}

function CatalogIcon({ name }) {
  const shapes = {
    'Усі': <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    'Ресторани': <><path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-4 2-5 6-5 10h5" /></>,
    'Кафе': <><path d="M4 9h12v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM16 10h2a3 3 0 0 1 0 6h-2M7 3v3M12 3v3" /></>,
    'Кальян-бари': <><path d="M8 3h8M10 3v5l-3 9a3 3 0 0 0 3 4h4a3 3 0 0 0 3-4l-3-9V3M9 14h6M17 17h2a2 2 0 0 0 2-2V9M19 9h3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    paw: <><ellipse cx="5" cy="8" rx="2" ry="3" /><ellipse cx="10" cy="5" rx="2" ry="3" /><ellipse cx="16" cy="5" rx="2" ry="3" /><ellipse cx="21" cy="9" rx="2" ry="3" /><path d="M6 18c0-3 3-7 6-7s7 4 7 7c0 4-4 2-6 2s-7 2-7-2Z" /></>,
  }
  return <svg className="catalog-icon" viewBox="0 0 26 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>
}

function LocationIcon() {
  return <svg className="location-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
}

function HeartIcon({ filled = false }) {
  return <svg viewBox="0 0 24 24" className="heart-icon" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>
}

function PlaceCard({ place, onBook, favorites }) {
  const open = isOpenNow(place.hours)
  const statusText = open === null ? '' : open ? 'Відкрито' : 'Зачинено'
  const hasMenu = /^https?:\/\//i.test(place.menu_url || '')
  return (
    <article className="card place-card">
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
        <div className="place-heading">
          <div className="place-title-row">
            <h3>{place.name}</h3>
            <button type="button" className={favorites.ids.includes(String(place.id)) ? 'favorite-button saved' : 'favorite-button'}
              aria-label={`${favorites.ids.includes(String(place.id)) ? 'Прибрати з обраного' : 'Додати в обране'}: ${place.name}`}
              aria-pressed={favorites.ids.includes(String(place.id))}
              disabled={favorites.loading || Boolean(favorites.error) || favorites.busyIds.includes(String(place.id))}
              onClick={() => favorites.toggle(place.id)}>
              <HeartIcon filled={favorites.ids.includes(String(place.id))} />
            </button>
            {open !== null && <span className={open ? 'badge open' : 'badge closed'}>{statusText}</span>}
          </div>
          {place.cuisine && <p className="place-cuisine">{place.cuisine}</p>}
        </div>
        {(place.address || place.district || place.distance != null) && (
          <div className="place-location">
            <LocationIcon />
            <p>{place.address || place.district}
              {place.distance != null && <span className="place-distance"> · {formatDistance(place.distance)}</span>}
            </p>
          </div>
        )}
        <div className="place-schedule">
          <span className="place-hours">{place.hours || 'Графік уточнюється'}</span>
        </div>
        {place.pet_friendly === true && <p className="pet-friendly-label"><CatalogIcon name="paw" />Можна з тваринами</p>}
        <div className="actions">
          {hasMenu && (
            <button className="menu-btn" onClick={() => openMenu(place.menu_url)}>
              Меню
            </button>
          )}
          <button className="book" onClick={() => onBook(place)}>
            Забронювати
          </button>
        </div>
      </div>
    </article>
  )
}


function App() {
  const favorites = useFavorites()
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [view, setView] = useState('list')
  const [category, setCategory] = useState('Усі')
  const [filters, setFilters] = useState(emptyFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [me, setMe] = useState(null)
  const [locating, setLocating] = useState(false)
  const locationRequest = useRef(0)
  const [locError, setLocError] = useState('')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(null)
  const [selected, setSelected] = useState(null)
  const [sent, setSent] = useState(false)
  const attemptRef = useRef(null)
  const [delivery, setDelivery] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
    const [isAdmin, setIsAdmin] = useState(false)
  const [screen, setScreen] = useState('catalog')
  const [reminderEnabled, setReminderEnabled] = useState(true)

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
    if (tg?.initData) {
      fetch('/api/cabinet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'me', initData: tg.initData }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.places?.length) setIsAdmin(true)
        })
        .catch(() => {})
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

  async function toggleNearMe() {
    setLocError('')
    if (me) {
      setMe(null)
      return
    }
    const request = ++locationRequest.current
    setLocating(true)
    try {
      const location = await getUserLocation()
      if (request === locationRequest.current) setMe(location)
    } catch {
      if (request === locationRequest.current) setLocError('Не вдалося визначити місцезнаходження. Дозвольте доступ до геолокації для Telegram в налаштуваннях телефона.')
    }
    if (request === locationRequest.current) setLocating(false)
  }

  const filterCount = countFilters(filters)
  const hasFilters = category !== 'Усі' || filterCount > 0 || Boolean(query.trim())
  function resetFilters() {
    setCategory('Усі')
    setFilters(emptyFilters())
    setQuery('')
    setPicked(null)
  }
  const districtOptions = filterOptions(places, 'district')
  const cuisineOptions = filterOptions(places, 'cuisine')
  const filterContext = { category, query, onlyFavorites, favoriteIds: favorites.ids }
  const filtered = filterPlaces(places, filters, filterContext, isOpenNow)
  const filterChips = [
    ...filters.districts.map((key) => ({ key: `district-${key}`, label: districtOptions.find(([id]) => id === key)?.[1] || key,
      remove: () => setFilters((old) => ({ ...old, districts: old.districts.filter((id) => id !== key) })) })),
    ...filters.cuisines.map((key) => ({ key: `cuisine-${key}`, label: cuisineOptions.find(([id]) => id === key)?.[1] || key,
      remove: () => setFilters((old) => ({ ...old, cuisines: old.cuisines.filter((id) => id !== key) })) })),
    ...(filters.petFriendly ? [{ key: 'pets', label: 'Можна з тваринами', remove: () => setFilters((old) => ({ ...old, petFriendly: false })) }] : []),
  ]

  const visible = me
    ? filtered
        .map((p) => ({
          ...p,
          distance:
            p.lat != null && p.lng != null
              ? distanceKm(me, { lat: p.lat, lng: p.lng })
              : null,
        }))
        .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
    : filtered

  const pickedVisible = visible.find((p) => p.id === picked?.id)

  function closeModal() {
    if (sending) return
    setSelected(null)
    setSent(false)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (attemptRef.current?.busy) return
    setSending(true)
    setError('')

    const f = new FormData(e.target)
    const initData = window.Telegram?.WebApp?.initData || ''
    const payload = { placeId: selected.id, date: f.get('date'), time: f.get('time'),
      guests: f.get('guests'), name: f.get('name'), phone: f.get('phone'), reminderEnabled }
    const signature = JSON.stringify(payload)
    let saved = attemptRef.current
    try { saved = saved || JSON.parse(sessionStorage.getItem('poimo-booking-attempt')) } catch { /* storage unavailable */ }
    if (!saved || saved.signature !== signature) saved = { signature, requestId: crypto.randomUUID() }
    attemptRef.current = { ...saved, busy: true }
    try { sessionStorage.setItem('poimo-booking-attempt', JSON.stringify(saved)) } catch { /* retain in memory */ }

    try {
      const r = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reminderEnabled,
          requestId: saved.requestId,
          placeId: selected.id,
          date: f.get('date'),
          time: f.get('time'),
          guests: f.get('guests'),
          name: f.get('name'),
          phone: f.get('phone'),
          initData,
        }),
      })
      if (r.status === 422) {
        const result = await r.json()
        setError(result.code === 'OUTSIDE_HOURS' || result.code === 'HOURS_UNAVAILABLE'
          ? result.message : 'Перевірте години роботи закладу.')
        return
      }
      if (r.status === 400) {
        setError('Перевірте дані: майбутню дату й час, кількість гостей і телефон у форматі +380XXXXXXXXX.')
        return
      }
      if (r.status === 429) {
        setError('Забагато заявок за короткий час. Спробуйте трохи пізніше.')
      } else if (r.status === 401) {
        setError('Відкрийте застосунок через Telegram і спробуйте ще раз.')
      } else if (!r.ok) {
        throw new Error('fail')
      } else {
        const result = await r.json()
        setDelivery(result.notificationStatus || 'unknown')
        setSent(true)
      }
    } catch {
      setError('Не вдалося надіслати заявку. Спробуйте ще раз.')
    } finally {
      attemptRef.current.busy = false
      setSending(false)
    }
  }
  if (screen === 'my-bookings') return <MyBookings onBack={() => setScreen('catalog')} />
  if (screen === 'cabinet') return <Cabinet onBack={() => setScreen('catalog')} />
  
  return (
    <div className="app">
         <div className="topbar">
        <div className="catalog-title"><p className="city-label">Київ</p><h1>Де поїмо?</h1></div>
        {isAdmin && (
          <button className="cab-btn" onClick={() => setScreen('cabinet')}>
            Кабінет
          </button>
        )}
      </div>

      <button className="my-bookings-link" onClick={() => setScreen("my-bookings")}>Мої бронювання <span aria-hidden="true">→</span></button>

      <div className="collection-tabs" role="group" aria-label="Колекція закладів">
        <button className={!onlyFavorites ? 'active' : ''} aria-pressed={!onlyFavorites} onClick={() => setOnlyFavorites(false)}>Усі заклади</button>
        <button className={onlyFavorites ? 'active' : ''} aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(true)}><HeartIcon filled={onlyFavorites} />Обране{!favorites.loading && !favorites.error && favorites.enabled ? ` · ${places.filter((p) => favorites.ids.includes(String(p.id))).length}` : ''}</button>
      </div>
      {favorites.loading && <p className="booking-note" role="status">Завантажуємо обране…</p>}
      {favorites.error && <div className="favorites-message" role="alert"><p>{favorites.error}</p>{favorites.enabled && <button className="menu-btn" disabled={favorites.busyIds.length > 0} onClick={favorites.retry}>Оновити обране</button>}</div>}
      {onlyFavorites && !favorites.enabled && <p role="status">Відкрийте застосунок через Telegram, щоб бачити своє обране.</p>}
      {onlyFavorites && favorites.enabled && !favorites.loading && !favorites.error && <p className="booking-note favorites-hint">Збережені заклади. Пошук і фільтри також застосовуються до обраного.</p>}

      <input
        className="search"
        aria-label="Пошук закладу за назвою"
        placeholder="Пошук за назвою"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="chips" role="group" aria-label="Категорії закладів">
        {CATEGORIES.map((c) => (
          <button
            aria-pressed={c === category}
            key={c}
            className={c === category ? 'chip active' : 'chip'}
            onClick={() => setCategory(c)}
          >
            <CatalogIcon name={c} />{c}
          </button>
        ))}
      </div>
      <div className="catalog-filter-toolbar">
        <button type="button" aria-pressed={filters.onlyOpen} className={filters.onlyOpen ? 'chip active' : 'chip'} onClick={() => setFilters((old) => ({ ...old, onlyOpen: !old.onlyOpen }))}><CatalogIcon name="clock" />Відкрито зараз</button>
        <button type="button" className={filterCount ? 'chip active' : 'chip'} aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>
          <svg className="catalog-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M4 17h16M8 4v6M16 14v6" /></svg>Фільтри{filterCount ? ` · ${filterCount}` : ''}
        </button>
      </div>
      {filterChips.length > 0 && <div className="selected-filters" aria-label="Обрані фільтри">{filterChips.map((chip) => <button type="button" key={chip.key} aria-label={`Прибрати фільтр: ${chip.label}`} onClick={chip.remove}>{chip.label}<span aria-hidden="true">×</span></button>)}</div>}
      <label className="catalog-sort"><span>Сортування</span><select aria-label="Сортування закладів" value={me ? 'near' : 'default'} disabled={locating} onChange={(e) => { if ((e.target.value === 'near') !== Boolean(me)) toggleNearMe() }}><option value="default">За замовчуванням</option><option value="near">Найближчі</option></select>{locating && <span role="status">Шукаємо вас…</span>}</label>
      {filtersOpen && <FilterSheet value={filters} districts={districtOptions} cuisines={cuisineOptions}
        unavailable={loading || loadError || (onlyFavorites && (favorites.loading || Boolean(favorites.error) || !favorites.enabled))}
        resultCount={(draft) => filterPlaces(places, draft, filterContext, isOpenNow).length}
        onClose={() => setFiltersOpen(false)} onApply={(draft) => { setFilters(draft); setFiltersOpen(false); setPicked(null) }} />}

      {!loading && !loadError && (
        <div className="results-bar">
          <p role="status" aria-live="polite">Знайдено закладів: <strong>{visible.length}</strong></p>
          {hasFilters && <button type="button" className="reset-filters" onClick={resetFilters}>Скинути</button>}
        </div>
      )}
      {me && <p className="hint left">Спочатку найближчі до вас. Відстань — по прямій.</p>}

      {locError && <p className="hint">{locError}</p>}

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
          {!loading && !loadError && visible.length === 0 && <p>{onlyFavorites && (favorites.loading || favorites.error || !favorites.enabled) ? '' : onlyFavorites && favorites.ids.length === 0 ? 'В обраному ще немає закладів. Натисніть сердечко на картці в каталозі.' : 'Нічого не знайдено. Змініть пошук або скиньте фільтри.'}</p>}
          {visible.map((p) => (
            <PlaceCard key={p.id} place={p} onBook={setSelected} favorites={favorites} />
          ))}
        </>
      )}

      {view === 'map' && !loading && !loadError && (
        <>
          <MapView places={visible} me={me} onPick={setPicked} />
          {pickedVisible ? (
            <PlaceCard place={pickedVisible} onBook={setSelected} favorites={favorites} />
          ) : (
            <p className="hint">{visible.length === 0 ? "Нічого не знайдено. Змініть пошук або скиньте фільтри." : "Натисніть на точку на карті, щоб побачити заклад"}</p>
          )}
        </>
      )}

      {selected && (
        <div className="overlay" onClick={closeModal}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={selected.name} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={closeModal} aria-label="Закрити форму">✕</button>
            <h2>{selected.name}</h2>
            {sent ? (
              <>
                <p>{delivery === 'sent' ? 'Заявку збережено й передано закладу. Очікуйте підтвердження в Telegram.' : 'Заявку збережено, але доставку повідомлення закладу не підтверджено. Не створюйте повторну заявку; зв’яжіться із закладом.'}</p>
                <button className="book" onClick={closeModal}>Закрити</button>
              </>
            ) : (
              <form onSubmit={handleSubmit}>
                <p className="hint left">Це заявка: бронювання діє лише після підтвердження закладом.</p>
                {!window.Telegram?.WebApp?.initData && <p role="status">Для надсилання відкрийте «Поїмо» через Telegram.</p>}
                <label className="field">
                  <span>Дата</span>
                  <input name="date" type="date" min={today} required />
                </label>
                <label className="field">
                  <span>Час</span>
                  <small>Години роботи: {selected.hours || "потребують уточнення"}. Після опівночі обирайте дату фактичного приходу.</small>
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
                  <input name="name" maxLength={80} autoComplete="name" placeholder="Як до вас звертатися" required />
                </label>
                <label className="field">
                  <span>Телефон</span>
                  <input name="phone" type="tel" autoComplete="tel" maxLength={24} placeholder="+380XXXXXXXXX" required />
                </label>
                <label className="reminder-option"><input type="checkbox" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} /><span>Нагадати в Telegram перед візитом</span></label>
                <p className="booking-note">Після підтвердження закладом — приблизно за 2 години. Якщо бронюєте пізніше, нагадування надійде за найближчої перевірки.</p>
                {error && <p>{error}</p>}
                <button className="book" type="submit" disabled={sending || !window.Telegram?.WebApp?.initData}>
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