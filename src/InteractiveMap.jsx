import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { coordinates, markerSvg } from './mapHelpers.js'

function icon(category, selected) {
  return L.divIcon({ className: `venue-marker${selected ? ' selected' : ''}`, html: `<span class="venue-marker-symbol">${markerSvg(category)}</span>`, iconSize: [44, 44], iconAnchor: [22, 22] })
}
export default function InteractiveMap({ places, me, selectedId, onPick, onLocate, locating, focusRequest, children }) {
  const box = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const userMarker = useRef(null)
  const markers = useRef(new Map())
  const fitKey = useRef(null)
  const onPickRef = useRef(onPick)
  const placesRef = useRef(places)
  const preview = useRef(null)
  const [tileError, setTileError] = useState(false)
  useEffect(() => { onPickRef.current = onPick; placesRef.current = places })
  useEffect(() => {
    const instance = L.map(box.current, { zoomControl: false, scrollWheelZoom: false }).setView([50.4501, 30.5234], 12)
    L.control.zoom({ position: 'topleft', zoomInTitle: 'Наблизити', zoomOutTitle: 'Віддалити' }).addTo(instance)
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance)
    tiles.on('tileerror', () => setTileError(true))
    layer.current = L.layerGroup().addTo(instance)
    map.current = instance
    const observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }))
    observer.observe(box.current)
    return () => { observer.disconnect(); instance.remove(); map.current = null; fitKey.current = null }
  }, [])
  useEffect(() => {
    const instance = map.current
    layer.current.clearLayers()
    markers.current.clear()
    const points = []
    for (const place of places) {
      const point = coordinates(place)
      if (!point) continue
      points.push(point)
      const marker = L.marker(point, { icon: icon(place.category, String(place.id) === String(selectedId)), title: place.name, alt: place.name, riseOnHover: true })
      const label = document.createElement('span')
      label.textContent = place.name
      marker.bindTooltip(label, { direction: 'top', offset: [0, -22] })
      marker.on('click', () => onPickRef.current(place))
      marker.addTo(layer.current)
      if (String(place.id) === String(selectedId)) marker.setZIndexOffset(2000)
      markers.current.set(String(place.id), marker)
    }
    const key = JSON.stringify(places.filter((p) => coordinates(p)).map((p) => [String(p.id), ...coordinates(p)]).sort((a, b) => a[0].localeCompare(b[0])))
    // Favourite toggles, selection and reordering must not reset the user's map position.
    if (key !== fitKey.current) {
      fitKey.current = key
      if (points.length) instance.fitBounds(points, { padding: [48, 70], maxZoom: 15, animate: false })
    }
  }, [places, selectedId])
  useEffect(() => {
    if (userMarker.current) userMarker.current.remove()
    userMarker.current = me ? L.marker([me.lat, me.lng], { icon: L.divIcon({ className: 'user-location-dot', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, zIndexOffset: 1000 }).addTo(map.current) : null
  }, [me])
  useEffect(() => {
    if (me) map.current.setView([me.lat, me.lng], 15, { animate: false })
  }, [me, focusRequest])
  useEffect(() => {
    if (selectedId == null) return
    const frame = requestAnimationFrame(() => {
      const marker = markers.current.get(String(selectedId))
      if (!marker) return
      map.current.panInside(marker.getLatLng(), { paddingTopLeft: [45, 80], paddingBottomRight: [45, (preview.current?.offsetHeight || 0) + 40], animate: false })
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedId])
  function showPlaces() {
    const points = placesRef.current.map(coordinates).filter(Boolean)
    if (points.length) map.current.fitBounds(points, { paddingTopLeft: [48, 70], paddingBottomRight: [48, (preview.current?.offsetHeight || 0) + 40], maxZoom: 15 })
  }
  const mappedCount = places.filter((p) => coordinates(p)).length
  return <section className="interactive-map" aria-label="Карта закладів Києва">
    <div ref={box} className="map-canvas" />
    <div className="map-actions"><button type="button" disabled={locating} onClick={onLocate}>{locating ? 'Шукаємо…' : '◎ Моє місце'}</button><button type="button" disabled={!mappedCount} onClick={showPlaces}>Усі на карті</button></div>
    {(tileError || mappedCount === 0 || mappedCount < places.length) && <p className="map-message" role="status">{tileError ? 'Не вдалося завантажити частину карти. Перевірте інтернет або перейдіть до списку.' : places.length === 0 ? 'За цими умовами немає закладів. Змініть фільтри.' : mappedCount === 0 ? 'Для цих закладів ще не вказані координати. Вони доступні у списку.' : `На карті: ${mappedCount} із ${places.length}. Решта — без координат.`}</p>}
    {!children && mappedCount > 0 && !tileError && <p className="map-pick-hint">Натисніть на позначку закладу</p>}
    {children && <div ref={preview} className="map-preview">{children}</div>}
  </section>
}
