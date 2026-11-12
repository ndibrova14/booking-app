export function publicUrl(value) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : null
  } catch { return null }
}
export function galleryPhotos(place) {
  return [...new Set([place.photo_url, ...(Array.isArray(place.gallery_urls) ? place.gallery_urls : [])].map(publicUrl).filter(Boolean))].slice(0, 12)
}
export function averageCheckLabel(value) {
  return Number.isInteger(value) && value > 0 ? `${new Intl.NumberFormat('uk-UA').format(value)} грн / людина` : null
}
export function venueAmenities(place) {
  return [
    place.pet_friendly === true && 'Можна з тваринами',
    place.has_terrace === true && 'Є тераса',
    place.kids_friendly === true && 'Зручно з дітьми',
    place.accessible_entrance === true && 'Безбар’єрний вхід',
  ].filter(Boolean)
}
