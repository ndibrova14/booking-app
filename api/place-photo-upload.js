import crypto from 'node:crypto'
import { db,verifyInitData } from './_lib.js'
import { PHOTO_BUCKET,MAX_PHOTO_BYTES,storageBase,storageHeaders,photoPublicUrl } from './_placePhotos.js'
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST')return res.status(405).json({ok:false})
  const {initData,placeId,size}=req.body || {}
  const user=verifyInitData(initData)
  if(!user || !Number.isSafeInteger(Number(user.id)) || Number(user.id)<1)return res.status(401).json({ok:false})
  const id=Number(placeId)
  if(!Number.isSafeInteger(id) || id<1 || !Number.isSafeInteger(size) || size<1 || size>MAX_PHOTO_BYTES)return res.status(400).json({ok:false,message:'Фото має бути розміром до 2 МБ після підготовки.'})
  try {
    const owner=String(user.id)===String(process.env.ADMIN_CHAT_ID)
    const places=await db(`places?id=eq.${id}${owner?'':`&admin_chat_id=eq.${Number(user.id)}`}&select=id`)
    if(!places.length)return res.status(403).json({ok:false,message:'Немає доступу до цього закладу.'})
    const file=`${crypto.randomUUID()}.jpg`
    const response=await fetch(`${storageBase()}/storage/v1/object/upload/sign/${PHOTO_BUCKET}/${id}/${file}`,{
      method:'POST',headers:{...storageHeaders(),'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000),
    })
    if(!response.ok)throw Error('sign')
    const signed=await response.json()
    const uploadUrl=new URL(`${storageBase()}/storage/v1${signed.url}`)
    if(uploadUrl.origin!==storageBase() || !uploadUrl.pathname.startsWith(`/storage/v1/object/upload/sign/${PHOTO_BUCKET}/${id}/`) || !uploadUrl.searchParams.has('token'))throw Error('url')
    return res.status(200).json({ok:true,uploadUrl:uploadUrl.toString(),publicUrl:photoPublicUrl(id,file)})
  }catch{return res.status(500).json({ok:false,message:'Не вдалося підготувати завантаження. Перевірте інтернет і налаштування сховища.'})}
}
