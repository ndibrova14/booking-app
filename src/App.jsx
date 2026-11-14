import { useState, useEffect, useRef, lazy, Suspense, Component } from 'react'
import './App.css'
import { trackEvent } from './analytics.js'
import useFavorites from './useFavorites.js'
import BookingContactFields from './BookingContactFields.jsx'
import { telegramContactId, writeContact } from './bookingContact.js'
import { coordinates, routeUrl } from './mapHelpers.js'
import { filterOptions, emptyFilters, countFilters, filterPlaces, AMENITY_FILTERS } from './catalogFilters.js'

const Cabinet = lazy(() => import('./Cabinet.jsx'))
const MyBookings = lazy(() => import('./MyBookings.jsx'))
const FilterSheet = lazy(() => import('./FilterSheet.jsx'))
const InteractiveMap = lazy(() => import('./InteractiveMap.jsx'))
const PlaceDetails = lazy(() => import('./PlaceDetails.jsx'))

function PageLoading({ onClose }) {
  return <div className="app"><p role="status">Завантажуємо розділ…</p><button type="button" className="menu-btn" onClick={onClose}>До каталогу</button></div>
}
function OverlayLoading({ onClose }) {
  const dialog = useRef(null)
  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])
  return <dialog ref={dialog} className="feature-loading-dialog" onCancel={(event) => { event.preventDefault(); onClose() }} aria-label="Завантаження розділу"><p role="status">Завантажуємо…</p><button type="button" className="menu-btn" onClick={onClose}>Скасувати</button></dialog>
}

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

function UiIcon({ name }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/></>,
    home: <><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></>,
    list: <><path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/></>,
    map: <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16"/></>,
    user: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
    route: <path d="m21 3-7 18-3-8-8-3Z"/>,
    more: <path d="M4 6h16M4 12h16M4 18h16"/>,
    search: <><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></>,
    serve: <><path d="M3 18h18M5 16a7 7 0 0 1 14 0M12 7V5M10 5h4M2 21h20"/></>,
  }
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function BookingDialog({ onClose, sending, children }) {
  const dialog = useRef(null)
  useEffect(() => {
    const node = dialog.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    node.showModal()
    return () => {
      node.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])
  function keepFocus(event) {
    if (event.key !== 'Tab') return
    const fields = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((node) => node.getClientRects().length > 0 && node.tabIndex >= 0)
    const first = fields[0]
    const last = fields.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  return <dialog ref={dialog} className="booking-dialog" aria-labelledby="booking-title" onKeyDown={keepFocus}
    onCancel={(event) => { event.preventDefault(); if (!sending) onClose() }}
    onClick={(event) => { if (event.target === dialog.current && !sending) onClose() }}>
    <div className="modal">{children}</div>
  </dialog>
}

function BottomNav({ active, onNavigate, filtersOpen, filterCount }) {
  return <nav className="bottom-nav" aria-label="Основна навігація">
    {[
      ['home', 'Головна', <UiIcon key="home" name="home" />],
      ['map', 'Карта', <LocationIcon key="map" />],
      ['favorites', 'Обране', <HeartIcon key="favorites" />],
      ['bookings', 'Бронювання', <UiIcon key="bookings" name="calendar" />],
      ['filters', 'Фільтри', <UiIcon key="filters" name="more" />],
    ].map(([id, label, icon]) => <button key={id} type="button" className={active === id || (id === 'filters' && filtersOpen) ? 'active' : ''}
      aria-current={active === id ? 'page' : undefined}
      aria-haspopup={id === 'filters' ? 'dialog' : undefined} aria-expanded={id === 'filters' ? filtersOpen : undefined}
      onClick={() => onNavigate(id)}>{icon}<span>{label}{id === 'filters' && filterCount > 0 ? ` · ${filterCount}` : ''}</span></button>)}
  </nav>
}

function PlaceCard({ place, onBook, onDetails, favorites }) {
  const [failedPhoto, setFailedPhoto] = useState(null)
  const open = isOpenNow(place.hours)
  const statusText = open === null ? '' : open ? 'Відкрито зараз' : 'Зачинено'
  const hasMenu = /^https?:\/\//i.test(place.menu_url || '')
  const hasPhoto = Boolean(place.photo_url && failedPhoto !== place.photo_url)
  return (
    <article className={hasPhoto ? "card place-card has-photo" : "card place-card"}>
      {hasPhoto && (
        <button type="button" className="place-photo-link" aria-label={`Детальніше про заклад: ${place.name}`} onClick={() => onDetails(place)}>
          <img className="photo" src={place.photo_url} alt="" loading="lazy" onError={() => setFailedPhoto(place.photo_url)} />
        </button>
      )}
      <div className="card-body">
        <div className="place-heading">
          <div className="place-title-row">
            <h3><button type="button" className="place-name-link" onClick={() => onDetails(place)}>{place.name}</button></h3>
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
        <button type="button" className="place-details-link" onClick={() => onDetails(place)}>Детальніше про заклад <span aria-hidden="true">→</span></button>
        <div className="actions">
          {hasMenu && (
            <button className="menu-btn" onClick={() => openMenu(place.menu_url)}>
              Меню
            </button>
          )}
          <button className="book" onClick={() => onBook(place)}><UiIcon name="calendar" />Забронювати столик</button>
          {coordinates(place) && <button type="button" className="route-button" aria-label={`Маршрут до ${place.name}`} onClick={() => openMenu(routeUrl(place))}><UiIcon name="route" /></button>}
        </div>
      </div>
    </article>
  )
}


function AppContent() {
  const favorites = useFavorites()
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [view, setView] = useState('list')
  const [filters, setFilters] = useState(emptyFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [me, setMe] = useState(null)
  const [locating, setLocating] = useState(false)
  const locationRequest = useRef(0)
  const [locError, setLocError] = useState('')
  const [mapFocusRequest, setMapFocusRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(null)
  const [selected, setSelected] = useState(null)
  const [detailPlace, setDetailPlace] = useState(null)
  const [sent, setSent] = useState(false)
  const attemptRef = useRef(null)
  const [delivery, setDelivery] = useState('')
  const [contactNotice, setContactNotice] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
    const [isAdmin, setIsAdmin] = useState(false)
  const [screen, setScreen] = useState('catalog')
  const [reminderEnabled, setReminderEnabled] = useState(true)

  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  useEffect(() => {
    trackEvent('app_open')
    const resume = () => { if (document.visibilityState === 'visible') trackEvent('app_open') }
    document.addEventListener('visibilitychange', resume)
    return () => document.removeEventListener('visibilitychange', resume)
  }, [])

  function openDetails(place) { trackEvent('place_view', place.id); setDetailPlace(place) }
  function openBooking(place) { trackEvent('booking_form_open', place.id); setSelected(place) }

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      const dark = tg.colorScheme === 'dark'
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      const bg = dark ? '#181818' : '#ffffff'
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

  async function locateOnMap() {
    setPicked(null)
    setLocError('')
    if (me) { setMapFocusRequest((n) => n + 1); return }
    const request = ++locationRequest.current
    setLocating(true)
    try {
      const location = await getUserLocation()
      if (request === locationRequest.current) { setMe(location); setMapFocusRequest((n) => n + 1) }
    } catch {
      if (request === locationRequest.current) setLocError('Не вдалося визначити місце. Перевірте дозвіл геолокації для Telegram. Картою можна користуватися без нього.')
    }
    if (request === locationRequest.current) setLocating(false)
  }

  const filterCount = countFilters(filters)
  const hasFilters = filterCount > 0 || Boolean(query.trim())
  function resetFilters() {
    setFilters(emptyFilters())
    setQuery('')
    setPicked(null)
  }
  const districtOptions = filterOptions(places, 'district')
  const cuisineOptions = filterOptions(places, 'cuisine')
  const filterContext = { query, onlyFavorites, favoriteIds: favorites.ids }
  const filtered = filterPlaces(places, filters, filterContext, isOpenNow)
  const filterChips = [
    ...(filters.category !== 'Усі' ? [{ key: 'category', label: filters.category,
      remove: () => setFilters((old) => ({ ...old, category: 'Усі' })) }] : []),
    ...filters.districts.map((key) => ({ key: `district-${key}`, label: districtOptions.find(([id]) => id === key)?.[1] || key,
      remove: () => setFilters((old) => ({ ...old, districts: old.districts.filter((id) => id !== key) })) })),
    ...filters.cuisines.map((key) => ({ key: `cuisine-${key}`, label: cuisineOptions.find(([id]) => id === key)?.[1] || key,
      remove: () => setFilters((old) => ({ ...old, cuisines: old.cuisines.filter((id) => id !== key) })) })),
    ...AMENITY_FILTERS.filter(({ key }) => filters[key]).map(({ key, label }) => ({ key: `amenity-${key}`, label, remove: () => setFilters((old) => ({ ...old, [key]: false })) })),
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
    setContactNotice('')
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (attemptRef.current?.busy) return
    setSending(true)
    setContactNotice('')
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
        if (f.has('rememberContact') && !writeContact(telegramContactId(initData), { name: f.get('name'), phone: f.get('phone') })) {
          setContactNotice('Заявку збережено, але запам’ятати контактні дані на цьому пристрої не вдалося.')
        }
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
  function navigate(section) {
    if (section === 'bookings') { setScreen('my-bookings'); return }
    setScreen('catalog')
    if (section === 'home') { setView('list'); setOnlyFavorites(false) }
    if (section === 'map') setView('map')
    if (section === 'favorites') { setView('list'); setOnlyFavorites(true) }
    if (section === 'filters') setFiltersOpen(true)
  }
  const activeNav = screen === 'my-bookings' ? 'bookings' : view === 'map' ? 'map' : onlyFavorites ? 'favorites' : 'home'
  const navigation = <BottomNav active={activeNav} onNavigate={navigate} filtersOpen={filtersOpen} filterCount={filterCount} />
  if (screen === 'my-bookings') return <div className="guest-section"><Suspense fallback={<PageLoading onClose={() => setScreen('catalog')} />}><MyBookings onBack={() => setScreen('catalog')} /></Suspense>{navigation}</div>
  if (screen === 'cabinet') return <Suspense fallback={<PageLoading onClose={() => setScreen('catalog')} />}><Cabinet onBack={() => setScreen('catalog')} onPlaceSaved={(updated) => setPlaces((old) => old.map((p) => p.id === updated.id ? { ...p, ...updated } : p))} /></Suspense>
  
  return (
    <div className={view === 'map' ? 'app catalog-app map-mode' : 'app catalog-app'}>
      <div className="brand-row"><span className="brand-mark"><CatalogIcon name="Ресторани" /></span><strong>Поїмо</strong></div>
         <div className="topbar">
        <div className="catalog-title"><p className="city-label"><LocationIcon />Київ</p><h1><span className="headline-word">{onlyFavorites ? 'Обране' : 'Де поїмо?'}</span> {!onlyFavorites && <span className="greeting" aria-hidden="true">👋</span>}</h1></div>
        {isAdmin && (
          <button className="cab-btn" onClick={() => setScreen('cabinet')}>
            <UiIcon name="user" />Кабінет
          </button>
        )}
      </div>

      {favorites.loading && <p className="booking-note" role="status">Завантажуємо обране…</p>}
      {favorites.error && <div className="favorites-message" role="alert"><p>{favorites.error}</p>{favorites.enabled && <button className="menu-btn" disabled={favorites.busyIds.length > 0} onClick={favorites.retry}>Оновити обране</button>}</div>}
      {onlyFavorites && !favorites.enabled && <p role="status">Відкрийте застосунок через Telegram, щоб бачити своє обране.</p>}
      {onlyFavorites && favorites.enabled && !favorites.loading && !favorites.error && <p className="booking-note favorites-hint">Збережені заклади. Пошук і фільтри також застосовуються до обраного.</p>}

      {view === 'map' && <div className="map-mode-title"><strong>{onlyFavorites ? 'Обране на карті' : 'Заклади на карті'}</strong><span>Знайдено: {visible.length}</span></div>}
      <div className="search-wrap"><UiIcon name="search" /><input
        className="search"
        aria-label="Пошук закладу за назвою"
        placeholder="Пошук за назвою"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      /></div>

      <div className="catalog-quick-controls">
        <button type="button" aria-pressed={filters.onlyOpen} className={filters.onlyOpen ? 'chip active' : 'chip'} onClick={() => setFilters((old) => ({ ...old, onlyOpen: !old.onlyOpen }))}><CatalogIcon name="clock" />Відкрито зараз</button>
      </div>
      {filterChips.length > 0 && <div className="selected-filters" aria-label="Обрані фільтри">{filterChips.map((chip) => <button type="button" key={chip.key} aria-label={`Прибрати фільтр: ${chip.label}`} onClick={chip.remove}>{chip.label}<span aria-hidden="true">×</span></button>)}</div>}
      <label className="catalog-sort"><span>Сортування</span><select aria-label="Сортування закладів" value={me ? 'near' : 'default'} disabled={locating} onChange={(e) => { if ((e.target.value === 'near') !== Boolean(me)) toggleNearMe() }}><option value="default">За замовчуванням</option><option value="near">Найближчі</option></select>{locating && <span role="status">Шукаємо вас…</span>}</label>
      {filtersOpen && <Suspense fallback={<OverlayLoading onClose={() => setFiltersOpen(false)} />}><FilterSheet value={filters} categories={CATEGORIES} renderCategoryIcon={(name) => <CatalogIcon name={name} />} districts={districtOptions} cuisines={cuisineOptions}
        unavailable={loading || loadError || (onlyFavorites && (favorites.loading || Boolean(favorites.error) || !favorites.enabled))}
        resultCount={(draft) => filterPlaces(places, draft, filterContext, isOpenNow).length}
        onClose={() => setFiltersOpen(false)} onApply={(draft) => { setFilters(draft); setFiltersOpen(false); setPicked(null) }} /></Suspense>}

      {!loading && !loadError && (
        <div className="results-bar">
          <p role="status" aria-live="polite">Знайдено закладів: <strong>{visible.length}</strong></p>
          {hasFilters && <button type="button" className="reset-filters" onClick={resetFilters}>Скинути</button>}
        </div>
      )}
      {me && <p className="hint left">Спочатку найближчі до вас. Відстань — по прямій.</p>}

      {locError && <p className="hint">{locError}</p>}

      {loading && <p>Завантаження…</p>}
      {loadError && <p>Не вдалося завантажити заклади. Спробуйте пізніше.</p>}

      {view === 'list' && (
        <>
          {!loading && !loadError && visible.length === 0 && <p>{onlyFavorites && (favorites.loading || favorites.error || !favorites.enabled) ? '' : onlyFavorites && favorites.ids.length === 0 ? 'В обраному ще немає закладів. Натисніть сердечко на картці в каталозі.' : 'Нічого не знайдено. Змініть пошук або скиньте фільтри.'}</p>}
          {visible.map((p) => (
            <PlaceCard key={p.id} place={p} onBook={openBooking} onDetails={openDetails} favorites={favorites} />
          ))}
        </>
      )}

      {view === 'map' && !loading && !loadError && (
        <Suspense fallback={<section className="interactive-map map-loading" role="status">Завантажуємо карту…</section>}><InteractiveMap places={visible} me={me} selectedId={pickedVisible?.id} onPick={(place) => { trackEvent('place_view', place.id); setPicked(place) }} onLocate={locateOnMap} locating={locating} focusRequest={mapFocusRequest}>
          {pickedVisible && <article className="map-place-card" aria-label={`Вибраний заклад: ${pickedVisible.name}`}>
            <div className="map-place-heading"><h2>{pickedVisible.name}</h2><button type="button" className="favorite-button" aria-label={favorites.ids.includes(String(pickedVisible.id)) ? 'Прибрати з обраного' : 'Додати в обране'} aria-pressed={favorites.ids.includes(String(pickedVisible.id))} disabled={favorites.loading || Boolean(favorites.error) || favorites.busyIds.includes(String(pickedVisible.id))} onClick={() => favorites.toggle(pickedVisible.id)}><HeartIcon filled={favorites.ids.includes(String(pickedVisible.id))} /></button><button type="button" className="map-card-close" aria-label="Закрити картку закладу" onClick={() => setPicked(null)}>✕</button></div>
            <p>{pickedVisible.cuisine}</p>
            <p>{pickedVisible.address || pickedVisible.district}{pickedVisible.distance != null ? ` · ${formatDistance(pickedVisible.distance)} по прямій` : ''}</p>
            <p><span className={isOpenNow(pickedVisible.hours) === true ? 'map-open-status' : ''}>{isOpenNow(pickedVisible.hours) === null ? 'Графік уточнюється' : isOpenNow(pickedVisible.hours) ? 'Відкрито' : 'Зачинено'}</span>{pickedVisible.hours ? ` · ${pickedVisible.hours}` : ''}</p>
            <div className="map-place-links"><button type="button" onClick={() => openDetails(pickedVisible)}>Детальніше</button><button type="button" onClick={() => { const url = routeUrl(pickedVisible); if (url) openMenu(url) }} disabled={!coordinates(pickedVisible)}>Маршрут ↗</button>{/^https?:\/\//i.test(pickedVisible.menu_url || '') && <button type="button" onClick={() => openMenu(pickedVisible.menu_url)}>Меню ↗</button>}</div>
            <button type="button" className="book" onClick={() => openBooking(pickedVisible)}>Забронювати</button>
          </article>}
        </InteractiveMap></Suspense>
      )}

      {navigation}
      {detailPlace && <Suspense fallback={<OverlayLoading onClose={() => setDetailPlace(null)} />}><PlaceDetails key={detailPlace.id} place={detailPlace} open={isOpenNow(detailPlace.hours)} favorites={favorites} openLink={openMenu} renderHeart={(filled) => <HeartIcon filled={filled} />} onClose={() => setDetailPlace(null)} onBook={(place) => { setDetailPlace(null); openBooking(place) }} /></Suspense>}
      {selected && (
        <BookingDialog onClose={closeModal} sending={sending}>
            <button type="button" className="modal-close" onClick={closeModal} aria-label="Закрити форму">✕</button>
            <h2 id="booking-title">{selected.name}</h2>
            {sent ? (
              <>
                <p>{delivery === 'sent' ? 'Заявку збережено й передано закладу. Очікуйте підтвердження в Telegram.' : delivery === 'skipped' ? 'Заявку збережено. Перевірте її актуальний статус у «Моїх бронюваннях».' : ['queued', 'retrying', 'sending'].includes(delivery) ? 'Заявку збережено. Повідомлення закладу ще доставляється — повторювати заявку не потрібно. Очікуйте підтвердження в Telegram.' : 'Заявку збережено, але доставку повідомлення закладу не підтверджено. Не створюйте повторну заявку; зв’яжіться із закладом.'}</p>
                {contactNotice && <p role="status">{contactNotice}</p>}
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
                <BookingContactFields key={telegramContactId(window.Telegram?.WebApp?.initData || '') || 'anonymous'} userId={telegramContactId(window.Telegram?.WebApp?.initData || '')} disabled={sending} />
                <label className="reminder-option"><input type="checkbox" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} /><span>Нагадати в Telegram перед візитом</span></label>
                <p className="booking-note">Після підтвердження закладом — приблизно за 2 години. Якщо бронюєте пізніше, нагадування надійде за найближчої перевірки.</p>
                {error && <p>{error}</p>}
                <button className="book" type="submit" disabled={sending || !window.Telegram?.WebApp?.initData}>
                  {sending ? 'Надсилаємо…' : 'Надіслати заявку'}
                </button>
              </form>
            )}
        </BookingDialog>
      )}
    </div>
  )
}

class FeatureBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div className="app"><h1>Не вдалося відкрити розділ</h1><p>Перевірте інтернет і оновіть застосунок.</p><button type="button" className="book" onClick={() => window.location.reload()}>Оновити застосунок</button></div>
    return this.props.children
  }
}
function App() { return <FeatureBoundary><AppContent /></FeatureBoundary> }

export default App