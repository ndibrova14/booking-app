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
  return { districts: [], cuisines: [], onlyOpen: false, petFriendly: false }
}
export function countFilters(filters) {
  return filters.districts.length + filters.cuisines.length + Number(filters.onlyOpen) + Number(filters.petFriendly)
}
export function filterPlaces(places, filters, context, isOpenNow) {
  const query = filterKey(context.query)
  const favoriteIds = new Set(context.favoriteIds.map(String))
  return places.filter((p) =>
    (!context.onlyFavorites || favoriteIds.has(String(p.id))) &&
    (context.category === 'Усі' || p.category === context.category) &&
    (!filters.onlyOpen || isOpenNow(p.hours) === true) &&
    (!filters.petFriendly || p.pet_friendly === true) &&
    (!filters.districts.length || filters.districts.includes(filterKey(p.district))) &&
    (!filters.cuisines.length || filters.cuisines.includes(filterKey(p.cuisine))) &&
    filterKey(p.name).includes(query)
  )
}
