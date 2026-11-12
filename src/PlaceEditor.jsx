import { useEffect, useRef, useState } from 'react'
import PlaceDetails from './PlaceDetails.jsx'
import { galleryPhotos } from './placeDetails.js'
import { prepareVenuePhoto } from './prepareVenuePhoto.js'

async function api(body) {
  const response=await fetch('/api/place-editor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,initData:window.Telegram?.WebApp?.initData || ''})})
  const data=await response.json()
  if(!response.ok) throw new Error(data.message || (response.status===401?'Відкрийте застосунок заново через Telegram.':'Не вдалося завантажити дані.'))
  return data
}
const OPTIONS=[['pet_friendly','Можна з тваринами'],['has_terrace','Тераса'],['kids_friendly','Зручно з дітьми'],['accessible_entrance','Безбар’єрний вхід']]
function toDraft(place) {
  const match=/^(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})$/.exec(place.hours || '')
  return Object.fromEntries([
    ...['name','category','cuisine','description','menu_url','visit_notes','pet_notes'].map((key)=>[key,place[key] || '']),
    ['photos',galleryPhotos(place)],
    ['average_check',place.average_check==null?'':String(place.average_check)],
    ['opens',match?match[1].padStart(5,'0'):''],['closes',match?match[2].padStart(5,'0'):''],
    ...OPTIONS.map(([key])=>[key,place[key]===true?'yes':place[key]===false?'no':'unknown']),
  ])
}
function fieldsFrom(draft) {
  const {opens,closes,photos,...fields}=draft
  fields.photo_url=photos[0] || null
  fields.gallery_urls=photos.slice(1)
  fields.hours=`${opens}–${closes}`
  fields.average_check=draft.average_check.trim()===''?null:Number(draft.average_check)
  for(const [key] of OPTIONS)fields[key]=draft[key]==='unknown'?null:draft[key]==='yes'
  return fields
}
const previewFavorites={ids:[],loading:true,error:'',enabled:false,busyIds:[]}
export default function PlaceEditor({onBack,onExit,onSaved}) {
  const [places,setPlaces]=useState([])
  const [place,setPlace]=useState(null)
  const [draft,setDraft]=useState(null)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [uploadBusy,setUploadBusy]=useState(false)
  const [uploadStatus,setUploadStatus]=useState('')
  const uploadLock=useRef(false)
  const fileInput=useRef(null)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [preview,setPreview]=useState(null)
  const sequence=useRef({id:0,active:true})
  const form=useRef(null)
  const dirty=Boolean(place && draft && JSON.stringify(draft)!==JSON.stringify(toDraft(place)))
  useEffect(()=>{
    let active=true
    const requests=sequence.current
    requests.active=true
    async function start() {
      try {
        const data=await api({action:'list'})
        if(!active)return
        setPlaces(data.places)
        if(data.places.length){const result=await api({action:'get',placeId:data.places[0].id});if(active){setPlace(result.place);setDraft(toDraft(result.place))}}
      }catch(e){if(active)setError(e.message)}finally{if(active)setLoading(false)}
    }
    start()
    return()=>{active=false;requests.active=false;requests.id++}
  },[])
  useEffect(()=>{
    if(!dirty)return
    const warn=(e)=>{e.preventDefault();e.returnValue=''}
    window.addEventListener('beforeunload',warn)
    return()=>window.removeEventListener('beforeunload',warn)
  },[dirty])
  function mayLeave(){if(uploadLock.current)return false;return !dirty || window.confirm('Є незбережені зміни. Вийти без збереження?')}
  async function loadPlace(id) {
    if(!mayLeave())return
    const request=++sequence.current.id
    setLoading(true);setError('');setNotice('')
    try{
      const result=await api({action:'get',placeId:id})
      if(request===sequence.current.id && sequence.current.active){setPlace(result.place);setDraft(toDraft(result.place))}
    }catch(e){if(request===sequence.current.id && sequence.current.active)setError(e.message)}finally{if(request===sequence.current.id && sequence.current.active)setLoading(false)}
  }
  function change(key,value){setDraft((old)=>({...old,[key]:value}));setNotice('')}
  async function save(e) {
    e.preventDefault()
    if(saving || uploadLock.current)return
    if(draft.opens===draft.closes){setError('Час відкриття й закриття має відрізнятися.');return}
    setSaving(true);setError('');setNotice('')
    try{
      const result=await api({action:'save',placeId:place.id,version:place.editor_version,fields:fieldsFrom(draft)})
      setPlace(result.place);setDraft(toDraft(result.place));setPlaces((old)=>old.map((p)=>p.id===result.place.id?{...p,name:result.place.name}:p))
      onSaved(result.place)
      setNotice('Зміни збережено. У вашому каталозі вони вже оновлені. Інші гості побачать оновлення після оновлення каталогу; через кеш це може зайняти до 90 секунд.')
    }catch(e){setError(e.message)}finally{setSaving(false)}
  }
  async function uploadFiles(event) {
    const files=Array.from(event.target.files || [])
    event.target.value=''
    if(!files.length || uploadLock.current)return
    if(files.length>12-draft.photos.length){setError(`Можна додати ще ${12-draft.photos.length} фото. Максимум — 12.`);return}
    uploadLock.current=true;setUploadBusy(true);setError('');setNotice('')
    let added=0
    try {
      for(const [index,file] of files.entries()) {
        setUploadStatus(`Готуємо фото ${index+1} із ${files.length}…`)
        const blob=await prepareVenuePhoto(file)
        setUploadStatus(`Завантажуємо фото ${index+1} із ${files.length}…`)
        const signing=await fetch('/api/place-photo-upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({placeId:place.id,size:blob.size,initData:window.Telegram?.WebApp?.initData || ''})})
        const signed=await signing.json()
        if(!signing.ok)throw Error(signed.message || 'Не вдалося отримати дозвіл на завантаження.')
        const response=await fetch(signed.uploadUrl,{method:'PUT',headers:{'Content-Type':'image/jpeg','Cache-Control':'max-age=3600','x-upsert':'false'},body:blob,signal:AbortSignal.timeout(60000)})
        if(!response.ok)throw Error('Не вдалося завантажити фото. Перевірте інтернет і спробуйте ще раз.')
        setDraft((old)=>({...old,photos:[...old.photos,signed.publicUrl]}))
        added++
      }
      setNotice(`Додано фото: ${added}. Натисніть «Зберегти зміни», щоб показати їх гостям.`)
    }catch(e){setError(`${e.message}${added ? ` Уже завантажено: ${added}. Їх можна зберегти.` : ''}`)}
    finally{uploadLock.current=false;setUploadBusy(false);setUploadStatus('')}
  }
  function reorderPhoto(index,offset) {
    setDraft((old)=>{const photos=[...old.photos];const target=index+offset;if(target<0 || target>=photos.length)return old;[photos[index],photos[target]]=[photos[target],photos[index]];return {...old,photos}})
    setNotice('')
  }
  function makeCover(index) {
    setDraft((old)=>({...old,photos:[old.photos[index],...old.photos.filter((_,i)=>i!==index)]}));setNotice('')
  }
  return <div className="app venue-editor">
    <div className="editor-navigation"><button className="back" disabled={saving || uploadBusy} onClick={()=>{if(mayLeave())onBack()}}>← Бронювання</button><button className="back" disabled={saving || uploadBusy} onClick={()=>{if(mayLeave())onExit()}}>До каталогу</button></div>
    <h1>Мій заклад</h1>
    {loading && <p role="status">Завантажуємо інформацію…</p>}
    {error && <div role="alert" className="editor-message"><p>{error}</p>{place?<button type="button" className="menu-btn" disabled={loading || saving || uploadBusy} onClick={()=>loadPlace(place.id)}>Завантажити актуальні дані</button>:<button type="button" className="menu-btn" onClick={onBack}>До бронювань</button>}</div>}
    {notice && <p role="status" className="editor-message">{notice}</p>}
    {!loading && places.length===0 && !error && <p>У вас немає закладів для редагування. Зверніться до власника «Поїмо».</p>}
    {places.length>1 && <label className="field editor-place-picker"><span>Заклад</span><select value={place?.id || ''} disabled={loading || saving || uploadBusy} onChange={(e)=>loadPlace(Number(e.target.value))}><option value="" disabled>Оберіть заклад</option>{places.map((p)=><option key={p.id} value={p.id}>{p.name}{p.is_active?'':' · неактивний'}</option>)}</select></label>}
    {place && draft && !loading && <form ref={form} onSubmit={save}>
      {!place.is_active && <p className="booking-note">Заклад неактивний і не показується гостям. Активувати його може власник «Поїмо».</p>}
      <fieldset disabled={saving || uploadBusy} className="editor-fields">
        <section><h2>Основна інформація</h2>
          <label className="field"><span>Назва</span><input required maxLength={120} value={draft.name} onChange={(e)=>change('name',e.target.value)} /></label>
          <label className="field"><span>Тип закладу</span><select required value={draft.category} onChange={(e)=>change('category',e.target.value)}><option value="" disabled>Оберіть тип</option>{['Ресторани','Кафе','Кальян-бари'].map((c)=><option key={c} value={c}>{c}</option>)}</select></label>
          <label className="field"><span>Кухня</span><input maxLength={120} value={draft.cuisine} onChange={(e)=>change('cuisine',e.target.value)} placeholder="Наприклад: Італійська" /></label>
          <label className="field"><span>Опис</span><textarea rows={5} maxLength={3000} value={draft.description} onChange={(e)=>change('description',e.target.value)} /></label>
          <label className="field"><span>Середній чек, грн на людину</span><input type="number" inputMode="numeric" min="1" max="100000" step="1" value={draft.average_check} onChange={(e)=>change('average_check',e.target.value)} placeholder="Не уточнено" /></label>
          <label className="field"><span>Посилання на меню</span><input type="url" maxLength={2000} value={draft.menu_url} onChange={(e)=>change('menu_url',e.target.value)} placeholder="https://…" /></label>
        </section>
        <section><h2>Щоденний графік</h2><p className="booking-note">Один графік для всіх днів. Закриття після опівночі підтримується. Від цього графіка залежить доступний час бронювання.</p><div className="editor-time-fields"><label className="field"><span>Відкриття</span><input type="time" required value={draft.opens} onChange={(e)=>change('opens',e.target.value)} /></label><label className="field"><span>Закриття</span><input type="time" required value={draft.closes} onChange={(e)=>change('closes',e.target.value)} /></label></div></section>
        <section><h2>Зручності</h2><p className="booking-note">Оберіть «Не уточнено», якщо інформація ще не підтверджена.</p>{OPTIONS.map(([key,label])=><label className="field" key={key}><span>{label}</span><select value={draft[key]} onChange={(e)=>change(key,e.target.value)}><option value="unknown">Не уточнено</option><option value="yes">Так</option><option value="no">Ні</option></select></label>)}</section>
        <section><h2>Умови відвідування</h2><label className="field"><span>Умови для гостей із тваринами</span><textarea rows={3} maxLength={1000} value={draft.pet_notes} onChange={(e)=>change('pet_notes',e.target.value)} placeholder="Наприклад: лише на терасі" /></label><label className="field"><span>Важливо перед візитом</span><textarea rows={3} maxLength={1500} value={draft.visit_notes} onChange={(e)=>change('visit_notes',e.target.value)} /></label></section>
        <section><h2>Фото закладу</h2><p className="booking-note">До 12 фото. Перше — головне. JPG, PNG або WebP до 20 МБ; застосунок автоматично зменшить фото. Зміни з’являться у гостей після збереження.</p>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={uploadFiles} />
          <button type="button" className="menu-btn photo-upload-button" disabled={uploadBusy || draft.photos.length>=12} onClick={()=>fileInput.current.click()}>{uploadBusy?'Завантаження…':'Додати фото з пристрою'}</button>
          {uploadStatus && <p className="booking-note" role="status">{uploadStatus}</p>}
          {draft.photos.length===0 && <p className="booking-note">Фото ще немає.</p>}
          <ol className="editor-photo-list">{draft.photos.map((url,index)=><li key={url}>
            <img src={url} alt={`Фото закладу ${index+1}`} loading="lazy" />
            <div className="editor-photo-info"><strong>{index===0?'Головне фото':`Фото ${index+1}`}</strong><div className="editor-photo-actions">
              {index>0 && <button type="button" onClick={()=>makeCover(index)}>Зробити головним</button>}
              <button type="button" disabled={index===0} aria-label={`Перемістити фото ${index+1} раніше`} onClick={()=>reorderPhoto(index,-1)}>↑</button>
              <button type="button" disabled={index===draft.photos.length-1} aria-label={`Перемістити фото ${index+1} далі`} onClick={()=>reorderPhoto(index,1)}>↓</button>
              <button type="button" onClick={()=>{change('photos',draft.photos.filter((_,i)=>i!==index))}}>Прибрати</button>
            </div></div>
          </li>)}</ol>
          <p className="booking-note">«Прибрати» видаляє фото з галереї після збереження. Якщо прибрати головне, ним стане наступне фото.</p>
        </section>
        <section><h2>Адреса</h2><p>{place.address || 'Адреса ще не вказана'}</p><p className="booking-note">Зміни адреси й точки на карті узгоджуються з власником «Поїмо».</p></section>
      </fieldset>
      <div className="editor-footer"><button type="button" className="menu-btn" disabled={saving || uploadBusy} onClick={()=>{if(form.current.reportValidity()){setPreview({...place,...fieldsFrom(draft)})}}}>Попередній перегляд</button><button className="book" type="submit" disabled={saving || uploadBusy || !dirty}>{saving?'Зберігаємо…':'Зберегти зміни'}</button></div>
      {dirty && <p className="booking-note">Є незбережені зміни.</p>}
    </form>}
    {preview && <PlaceDetails place={preview} open={null} favorites={previewFavorites} preview onClose={()=>setPreview(null)} onBook={()=>{}} openLink={(url)=>{const tg=window.Telegram?.WebApp;if(tg?.openLink)tg.openLink(url);else window.open(url,'_blank','noopener')}} renderHeart={()=>null} />}
  </div>
}
