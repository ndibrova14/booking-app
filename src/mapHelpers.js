export function coordinates(place) {
  if (place?.lat == null || place?.lng == null || String(place.lat).trim() === '' || String(place.lng).trim() === '') return null
  if (!['string', 'number'].includes(typeof place.lat) || !['string', 'number'].includes(typeof place.lng)) return null
  const lat = Number(place.lat)
  const lng = Number(place.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? [lat, lng] : null
}
export function routeUrl(place) {
  const point = coordinates(place)
  if (!point) return null
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('destination', point.join(','))
  return url.toString()
}
export function markerSvg(category) {
  const paths = Object.assign(Object.create(null), {
    'Ресторани': '<path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-4 2-5 6-5 10h5"/>',
    'Кафе': '<path d="M4 9h12v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM16 10h2a3 3 0 0 1 0 6h-2M7 3v3M12 3v3"/>',
    'Кальян-бари': '<path d="M8 3h8M10 3v5l-3 9a3 3 0 0 0 3 4h4a3 3 0 0 0 3-4l-3-9V3M9 14h6M17 17h2a2 2 0 0 0 2-2V9"/>',
  })
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[category] || '<circle cx="12" cy="12" r="5"/>'}</svg>`
}
