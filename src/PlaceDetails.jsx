import { useEffect, useRef, useState } from 'react'
import { averageCheckLabel, galleryPhotos, publicUrl, venueAmenities } from './placeDetails.js'
import { routeUrl } from './mapHelpers.js'

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
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    node.showModal()
    return () => { node.close(); document.body.style.overflow = previousOverflow }
  }, [])
  return <dialog ref={dialog} className="place-details" aria-labelledby="place-details-title" onCancel={(e) => { e.preventDefault(); onClose() }}>
    <header className="place-details-toolbar"><button type="button" onClick={onClose}>← Назад</button>{!preview && <button type="button" className={saved ? 'saved' : ''} aria-label={saved ? 'Прибрати з обраного' : 'Додати в обране'} aria-pressed={saved} disabled={favorites.loading || Boolean(favorites.error) || favorites.busyIds.includes(String(place.id))} onClick={() => favorites.toggle(place.id)}>{renderHeart(saved)}<span>{saved ? 'В обраному' : 'Зберегти'}</span></button>}</header>
    <div className="place-details-scroll">
      {photos.length > 0 && <section className="venue-gallery" aria-label="Фотографії закладу"><div className="venue-gallery-track">{photos.map((url, index) => <img key={url} src={url} alt={`${place.name} — фото ${index + 1}`} loading={index === 0 ? 'eager' : 'lazy'} onError={() => setFailedPhotos((old) => [...old, url])} />)}</div>{photos.length > 1 && <p>Фото: {photos.length} · гортайте вбік</p>}</section>}
      <div className="place-details-body">
        <p className="venue-eyebrow">{[place.category, place.district].filter(Boolean).join(' · ')}</p>
        <h1 id="place-details-title">{place.name}</h1>
        {place.cuisine && <p className="venue-cuisine">{place.cuisine}</p>}
        <div className="venue-status-row">{open !== null && <span className={open ? 'badge open' : 'badge closed'}>{open ? 'Відкрито зараз' : 'Зачинено зараз'}</span>}{place.hours && <span>{place.hours}</span>}</div>
        {favorites.error && <div className="favorites-message" role="alert"><p>{favorites.error}</p>{favorites.enabled && <button className="menu-btn" disabled={favorites.busyIds.length > 0} onClick={favorites.retry}>Оновити обране</button>}</div>}
        {text(place.description) && <section className="venue-section"><h2>Про заклад</h2><p className="venue-long-text">{text(place.description)}</p></section>}
        {averageCheck && <section className="venue-section"><h2>Середній чек</h2><p className="venue-price">{averageCheck}</p><p className="venue-help">Орієнтовна сума. Актуальні ціни — у меню закладу.</p></section>}
        <section className="venue-section"><h2>Адреса та графік</h2>{text(place.address) ? <p>{text(place.address)}</p> : <p className="venue-help">Точна адреса ще не вказана.</p>}{place.hours ? <p>Години роботи: {place.hours}</p> : <p className="venue-help">Графік уточнюється.</p>}{Number.isFinite(place.distance) && <p className="venue-help">{place.distance < 1 ? `${Math.round(place.distance * 1000)} м` : `${place.distance.toFixed(1).replace('.', ',')} км`} від вас по прямій</p>}{route && <button type="button" className="menu-btn" onClick={() => openLink(route)}>Маршрут у Google Maps ↗</button>}</section>
        {amenities.length > 0 && <section className="venue-section"><h2>Зручності</h2><ul className="venue-amenities">{amenities.map((label) => <li key={label}>✓ {label}</li>)}</ul></section>}
        {place.pet_friendly === false && <section className="venue-section"><h2>Відвідування з тваринами</h2><p>Відвідування з тваринами не передбачене.</p></section>}
        {place.pet_friendly === true && text(place.pet_notes) && <section className="venue-section"><h2>Умови для гостей із тваринами</h2><p className="venue-long-text">{text(place.pet_notes)}</p></section>}
        {text(place.visit_notes) && <section className="venue-section"><h2>Перед візитом</h2><p className="venue-long-text">{text(place.visit_notes)}</p></section>}
        <section className="venue-section"><h2>Меню</h2>{menu ? <button type="button" className="menu-btn" onClick={() => openLink(menu)}>Відкрити меню ↗</button> : <p className="venue-help">Меню ще не додано.</p>}</section>
      </div>
    </div>
    <footer className="place-details-footer"><p>{preview ? 'Попередній перегляд. Зміни ще не збережені.' : 'Бронювання діє після підтвердження закладом.'}</p><button type="button" className="book" onClick={() => preview ? onClose() : onBook(place)}>{preview ? 'До редагування' : 'Забронювати столик'}</button></footer>
  </dialog>
}
