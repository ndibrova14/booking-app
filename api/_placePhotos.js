export const PHOTO_BUCKET = 'poimo-venue-photos'
export const MAX_PHOTO_BYTES = 2097152
export function storageBase() { return new URL(process.env.SUPABASE_URL.trim()).origin }
export function storageHeaders() {
  const key=process.env.SUPABASE_SERVICE_KEY
  return { apikey:key, ...(key.startsWith('eyJ')?{Authorization:`Bearer ${key}`}:{}) }
}
export function photoPublicUrl(placeId, file) {
  return `${storageBase()}/storage/v1/object/public/${PHOTO_BUCKET}/${placeId}/${file}`
}
function normalize(value) {
  if(typeof value!=='string')return null
  try {const url=new URL(value);return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.toString():null}catch{return null}
}
export function existingPhotos(place) {
  return [...new Set([place.photo_url,...(Array.isArray(place.gallery_urls)?place.gallery_urls:[])].map(normalize).filter(Boolean))]
}
export async function validatePhotoChanges(fields,place) {
  const present=Object.hasOwn(fields,'photo_url') || Object.hasOwn(fields,'gallery_urls')
  if(!present)return {data:{}}
  const cover=fields.photo_url
  const gallery=fields.gallery_urls
  if(!Array.isArray(gallery) || gallery.length>11 || (cover!==null && typeof cover!=='string') || gallery.some((url)=>typeof url!=='string'))return {error:'Додайте не більше 12 фото й оберіть головне.'}
  if(cover===null && gallery.length)return {error:'Оберіть головне фото.'}
  const raw=cover===null?[]:[cover,...gallery]
  const photos=raw.map(normalize)
  if(photos.some((url)=>!url) || new Set(photos).size!==photos.length)return {error:'Посилання на фото некоректне або повторюється.'}
  const existing=new Set(existingPhotos(place))
  const added=photos.filter((url)=>!existing.has(url))
  const root=`${storageBase()}/storage/v1/object/public/${PHOTO_BUCKET}/${place.id}/`
  if(added.some((url)=>!url.startsWith(root) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i.test(url.slice(root.length))))return {error:'Додавайте фото кнопкою завантаження для цього закладу.'}
  // Only trusted, newly uploaded object URLs are requested. Existing external URLs are never fetched.
  const checks=await Promise.all(added.map(async(url)=>{
    try {
      const response=await fetch(url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(8000)})
      const size=Number(response.headers.get('content-length'))
      return response.ok && response.headers.get('content-type')?.split(';')[0]==='image/jpeg' && size>0 && size<=MAX_PHOTO_BYTES
    }catch{return false}
  }))
  if(checks.some((ok)=>!ok))return {error:'Одне з фото не завантажилось або має неправильний формат. Завантажте його повторно.'}
  return {data:{photo_url:photos[0] || null,gallery_urls:photos.slice(1)}}
}
