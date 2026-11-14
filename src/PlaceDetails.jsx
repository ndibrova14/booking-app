import { useEffect, useRef, useState } from 'react'
import { averageCheckLabel, galleryPhotos, publicUrl, venueAmenities } from './placeDetails.js'
import { routeUrl } from './mapHelpers.js'
import ScreenIcon from './ScreenIcon.jsx'

export default function PlaceDetails({ place, open, favorites, onClose, onBook, openLink, renderHeart, preview = false }) {
  const dialog = useRef(null)
  const [failedPhotos, setFailedPhotos] = useState([])
  const photos = galleryPhotos(place).filter((url) => !failedPhotos.includes(url))
  const menu = publicUrl(place.menu_url)
  const route = routeUrl(place)
  const averageCheck = averageCheckLabel(place.average_check)
  const amenities = venueAmenities(place)
  const saved = favorites.ids.includes(String(place.id))
  const text = (value) => typeof value === 'string' ? value.trim() : ''
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
  return <dialog ref={dialog} className="place-details venue-page" aria-labelledby="place-details-title" onCancel={(e) => { e.preventDefault(); onClose() }}>
    <div className="place-details-scroll">
      <div className="venue-hero">
        <header className="place-details-toolbar">
          <button type="button" onClick={onClose}><ScreenIcon name="back" /><span>Назад</span></button>
          {!preview && <button type="button" className={saved ? 'saved' : ''} aria-label={saved ? 'Прибрати з обраного' : 'Додати в обране'} aria-pressed={saved} disabled={favorites.loading || Boolean(favorites.error) || favorites.busyIds.includes(String(place.id))} onClick={() => favorites.toggle(place.id)}>{renderHeart(saved)}</button>}
        </header>
        {photos.length > 0 ? <section className="venue-gallery" aria-label="Фотографії закладу"><div className="venue-gallery-track">{photos.map((url, index) => <img key={url} src={url} alt={`${place.name} — фото ${index + 1}`} loading={index === 0 ? 'eager' : 'lazy'} onError={() => setFailedPhotos((old) => [...old, url])} />)}</div>{photos.length > 1 && <p className="venue-gallery-hint">{photos.length} фото · гортайте вбік</p>}</section> : <div className="venue-photo-empty"><ScreenIcon name="venue" /><span>{failedPhotos.length ? 'Фото тимчасово недоступні' : 'Фотографії ще не додано'}</span></div>}
      </div>
      <div className="place-details-body">
        <p className="venue-eyebrow">{[place.category, place.district].filter(Boolean).join(' · ') || 'Заклад Києва'}</p>
        <h1 id="place-details-title">{place.name}</h1>
        {place.cuisine && <p className="venue-cuisine">{place.cuisine}</p>}
        <div className="venue-status-row">{open !== null && <span className={open ? 'badge open' : 'badge closed'}>{open ? 'Відкрито зараз' : 'Зачинено зараз'}</span>}{place.hours && <span>{place.hours}</span>}</div>
        {favorites.error && <div className="favorites-message" role="alert"><p>{favorites.error}</p>{favorites.enabled && <button className="menu-btn" disabled={favorites.busyIds.length > 0} onClick={favorites.retry}>Оновити обране</button>}</div>}
        {(menu || route) && <div className="venue-quick-actions">{menu && <button type="button" onClick={() => openLink(menu)}><ScreenIcon name="menu" />Меню <span aria-hidden="true">↗</span></button>}{route && <button type="button" onClick={() => openLink(route)}><ScreenIcon name="route" />Маршрут <span aria-hidden="true">↗</span></button>}</div>}
        {text(place.description) && <section className="venue-section"><h2>Про заклад</h2><p className="venue-long-text">{text(place.description)}</p></section>}
        <section className="venue-section venue-facts" aria-label="Адреса, графік і середній чек">
          <div><ScreenIcon name="location" /><div><span className="fact-label">Адреса</span><p>{text(place.address) || 'Точна адреса ще не вказана'}</p>{Number.isFinite(place.distance) && <small>{place.distance < 1 ? `${Math.round(place.distance * 1000)} м` : `${place.distance.toFixed(1).replace('.', ',')} км`} від вас по прямій</small>}</div></div>
          <div><ScreenIcon name="clock" /><div><span className="fact-label">Години роботи</span><p>{place.hours || 'Графік уточнюється'}</p></div></div>
          {averageCheck && <div><ScreenIcon name="info" /><div><span className="fact-label">Середній чек</span><p>{averageCheck}</p><small>Орієнтовно. Актуальні ціни — у меню.</small></div></div>}
        </section>
        {amenities.length > 0 && <section className="venue-section"><h2>Зручності</h2><ul className="venue-amenities">{amenities.map((label) => <li key={label}><ScreenIcon name="check" />{label}</li>)}</ul></section>}
        {place.pet_friendly === false && <section className="venue-section"><h2>Відвідування з тваринами</h2><p>Відвідування з тваринами не передбачене.</p></section>}
        {place.pet_friendly === true && text(place.pet_notes) && <section className="venue-section"><h2>Умови для гостей із тваринами</h2><p className="venue-long-text">{text(place.pet_notes)}</p></section>}
        {text(place.visit_notes) && <section className="venue-section"><h2>Перед візитом</h2><p className="venue-long-text">{text(place.visit_notes)}</p></section>}
        {!menu && <section className="venue-section"><h2>Меню</h2><p className="venue-help">Меню ще не додано.</p></section>}
      </div>
    </div>
    <footer className="place-details-footer"><p><ScreenIcon name="info" />{preview ? 'Попередній перегляд. Зміни ще не збережені.' : 'Бронювання діє після підтвердження закладом.'}</p><button type="button" className="book" onClick={() => preview ? onClose() : onBook(place)}><ScreenIcon name={preview ? 'back' : 'calendar'} />{preview ? 'До редагування' : 'Забронювати столик'}</button></footer>
  </dialog>
}
