import { db, verifyInitData } from './_lib.js'
import { EDITOR_SELECT, validatePlaceEdit } from './_placeEditor.js'

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST') return res.status(405).json({ok:false})
  const {action,initData,placeId,version,fields}=req.body || {}
  const user=verifyInitData(initData)
  if(!user || !Number.isSafeInteger(Number(user.id)) || Number(user.id)<1) return res.status(401).json({ok:false})
  const userId=Number(user.id)
  const owner=String(userId)===String(process.env.ADMIN_CHAT_ID)
  const scope=owner?'':`&admin_chat_id=eq.${userId}`
  try {
    if(action==='list') {
      const places=await db(`places?select=id,name,is_active&order=id${scope}`)
      return res.status(200).json({ok:true,places})
    }
    const id=Number(placeId)
    if(!['get','save'].includes(action) || !Number.isSafeInteger(id) || id<1) return res.status(400).json({ok:false})
    const query=`places?id=eq.${id}${scope}&select=${EDITOR_SELECT}`
    const place=(await db(query))[0]
    if(!place) return res.status(403).json({ok:false,message:'Немає доступу до цього закладу.'})
    if(action==='get') return res.status(200).json({ok:true,place})
    if(!Number.isSafeInteger(version) || version<0 || version>=2147483647) return res.status(400).json({ok:false,message:'Оновіть дані закладу перед збереженням.'})
    const checked=validatePlaceEdit(fields)
    if(checked.error) return res.status(400).json({ok:false,message:checked.error})
    const rows=await db(`${query}&editor_version=eq.${version}`,{
      method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({...checked.data,editor_version:version+1}),
    })
    if(!rows.length) return res.status(409).json({ok:false,message:'Інший адміністратор уже змінив інформацію. Завантажте актуальні дані перед повторним редагуванням.'})
    return res.status(200).json({ok:true,place:rows[0]})
  } catch {return res.status(500).json({ok:false,message:'Не вдалося зберегти або завантажити дані. Перевірте підключення та оновіть інформацію перед повторною спробою.'})}
}
