export function telegramContactId(initData) {
  try {
    const user = JSON.parse(new URLSearchParams(initData).get('user'))
    return Number.isSafeInteger(user?.id) && user.id > 0 ? user.id : null
  } catch { return null }
}
export function contactKey(userId) {
  return Number.isSafeInteger(userId) && userId > 0 ? `poimo:booking-contact:v1:${userId}` : null
}
function cleanContact(value) {
  if (!value || typeof value.name !== 'string' || typeof value.phone !== 'string') return null
  const name = value.name.trim()
  const phone = value.phone.trim()
  return name.length > 0 && name.length <= 80 && /^[+\d\s()-]{8,24}$/.test(phone) ? { name, phone } : null
}
export function readContact(userId, storage) {
  const key = contactKey(userId)
  if (!key) return { contact: null, available: false }
  try {
    const target = storage ?? globalThis.localStorage
    const raw = target.getItem(key)
    return { contact: raw ? cleanContact(JSON.parse(raw)) : null, available: true }
  } catch { return { contact: null, available: false } }
}
export function writeContact(userId, value, storage) {
  const key = contactKey(userId)
  const contact = cleanContact(value)
  if (!key || !contact) return false
  try { (storage ?? globalThis.localStorage).setItem(key, JSON.stringify(contact)); return true }
  catch { return false }
}
export function forgetContact(userId, storage) {
  const key = contactKey(userId)
  if (!key) return false
  try { (storage ?? globalThis.localStorage).removeItem(key); return true }
  catch { return false }
}
