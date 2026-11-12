import { useState } from 'react'
import { forgetContact, readContact } from './bookingContact.js'

export default function BookingContactFields({ userId, disabled }) {
  const [initial] = useState(() => readContact(userId))
  const [name, setName] = useState(initial.contact?.name || '')
  const [phone, setPhone] = useState(initial.contact?.phone || '')
  const [remember, setRemember] = useState(Boolean(initial.contact))
  const [hasSaved, setHasSaved] = useState(Boolean(initial.contact))
  const [notice, setNotice] = useState('')
  function forget(clearFields) {
    if (!forgetContact(userId)) { setNotice('Не вдалося видалити збережені дані. Перевірте налаштування сховища пристрою.'); return false }
    setHasSaved(false)
    setRemember(false)
    if (clearFields) { setName(''); setPhone('') }
    setNotice('Збережені на цьому пристрої дані видалено. Це не змінює вже надіслані заявки.')
    return true
  }
  function changeRemember(checked) {
    if (!checked && hasSaved) { forget(false); return }
    setRemember(checked)
    setNotice('')
  }
  return <>
    <label className="field"><span>Ім’я</span><input name="name" maxLength={80} autoComplete="name" placeholder="Як до вас звертатися" required value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} /></label>
    <label className="field"><span>Телефон</span><input name="phone" type="tel" autoComplete="tel" maxLength={24} placeholder="+380XXXXXXXXX" required value={phone} disabled={disabled} onChange={(e) => setPhone(e.target.value)} /></label>
    {initial.available ? <>
      <label className="reminder-option"><input type="checkbox" name="rememberContact" checked={remember} disabled={disabled} onChange={(e) => changeRemember(e.target.checked)} /><span>Запам’ятати на цьому пристрої</span></label>
      <p className="booking-note">Ім’я й телефон підставлятимуться автоматично. Зберігаємо їх після успішного надсилання заявки; дані можна змінити перед кожною бронню.</p>
      {hasSaved && <button type="button" className="forget-contact" disabled={disabled} onClick={() => forget(true)}>Забути дані</button>}
    </> : userId && <p className="booking-note">Збереження на цьому пристрої недоступне. Ви можете заповнити й надіслати заявку вручну.</p>}
    {notice && <p className="booking-note" role="status">{notice}</p>}
  </>
}
