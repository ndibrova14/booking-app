export const AMENITY_FILTERS = [
  { key: 'petFriendly', field: 'pet_friendly', label: 'Можна з тваринами' },
  { key: 'terrace', field: 'has_terrace', label: 'Тераса' },
  { key: 'kidsFriendly', field: 'kids_friendly', label: 'Зручно з дітьми' },
  { key: 'accessibleEntrance', field: 'accessible_entrance', label: 'Безбар’єрний вхід' },
]

export function filterKey(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('uk') : ''
}
export function filterOptions(places, field) {
  const options = new Map()
  for (const place of places) {
    const key = filterKey(place[field])
    if (key && !options.has(key)) options.set(key, place[field].trim().replace(/\s+/g, ' '))
  }
  return [...options].sort((a, b) => a[1].localeCompare(b[1], 'uk'))
}
export function emptyFilters() {
  return { category: 'Усі', districts: [], cuisines: [], onlyOpen: false, petFriendly: false, terrace: false, kidsFriendly: false, accessibleEntrance: false }
}
export function countFilters(filters) {
  return Number(Boolean(filters.category && filters.category !== 'Усі')) + filters.districts.length + filters.cuisines.length + Number(filters.onlyOpen) + AMENITY_FILTERS.filter(({ key }) => filters[key]).length
}
export function filterPlaces(places, filters, context, isOpenNow) {
  const category = filters.category || context.category || 'Усі'
  const query = filterKey(context.query)
  const favoriteIds = new Set(context.favoriteIds.map(String))
  return places.filter((p) =>
    (!context.onlyFavorites || favoriteIds.has(String(p.id))) &&
    (category === 'Усі' || p.category === category) &&
    (!filters.onlyOpen || isOpenNow(p.hours) === true) &&
    AMENITY_FILTERS.every(({ key, field }) => !filters[key] || p[field] === true) &&
    (!filters.districts.length || filters.districts.includes(filterKey(p.district))) &&
    (!filters.cuisines.length || filters.cuisines.includes(filterKey(p.cuisine))) &&
    filterKey(p.name).includes(query)
  )
}
