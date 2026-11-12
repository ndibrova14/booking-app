export const EDITABLE_FIELDS = ['name','category','cuisine','description','average_check','menu_url','hours','pet_friendly','has_terrace','kids_friendly','accessible_entrance','visit_notes','pet_notes']
export const EDITOR_SELECT = 'id,name,category,cuisine,district,address,lat,lng,hours,photo_url,gallery_urls,menu_url,description,average_check,pet_friendly,has_terrace,kids_friendly,accessible_entrance,visit_notes,pet_notes,is_active,editor_version'
export function validatePlaceEdit(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error:'Некоректні дані форми.' }
  if (Object.keys(input).some((key) => !EDITABLE_FIELDS.includes(key))) return { error:'Форма містить поля, які не можна редагувати.' }
  const limits = {name:120,cuisine:120,description:3000,visit_notes:1500,pet_notes:1000,menu_url:2000}
  const data={}
  for (const [key,max] of Object.entries(limits)) {
    if (input[key] != null && typeof input[key] !== 'string') return {error:'Перевірте текстові поля.'}
    const text=(input[key] || '').trim()
    if (text.length>max || (key==='name' && !text)) return {error:`Перевірте поле «${key === 'name' ? 'Назва' : key}». Максимум ${max} символів.`}
    data[key]=text || null
  }
  if (!['Ресторани','Кафе','Кальян-бари'].includes(input.category)) return {error:'Оберіть тип закладу.'}
  data.category=input.category
  if (input.average_check !== null && (!Number.isInteger(input.average_check) || input.average_check<1 || input.average_check>100000)) return {error:'Середній чек: ціле число від 1 до 100000 грн або порожнє поле.'}
  data.average_check=input.average_check
  if (data.menu_url) {
    try {
      const url=new URL(data.menu_url)
      if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw Error('url')
      data.menu_url=url.toString()
    } catch {return {error:'Посилання на меню має починатися з https:// або http://.'}}
  }
  const hours=/^([01]\d|2[0-3]):([0-5]\d)[–-]([01]\d|2[0-3]):([0-5]\d)$/.exec(input.hours || '')
  if (!hours || hours[1]+hours[2]===hours[3]+hours[4]) return {error:'Вкажіть різний час відкриття й закриття у форматі 12:00–23:00.'}
  data.hours=`${hours[1]}:${hours[2]}–${hours[3]}:${hours[4]}`
  for(const key of ['pet_friendly','has_terrace','kids_friendly','accessible_entrance']) {
    if (input[key] !== null && typeof input[key] !== 'boolean') return {error:'Оберіть «Так», «Ні» або «Не уточнено» для зручностей.'}
    data[key]=input[key]
  }
  return {data}
}
