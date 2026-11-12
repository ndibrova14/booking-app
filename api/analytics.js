import { db, verifyInitData } from './_lib.js'

const UUID=/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i
function dateValid(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))return false
  const date=new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST')return res.status(405).json({ok:false})
  const {action,initData,eventType,sessionId,placeId,start,end,includeTest=false}=req.body || {}
  const user=verifyInitData(initData)
  const userId=Number(user?.id)
  if(!user || !Number.isSafeInteger(userId) || userId<1)return res.status(401).json({ok:false})
  const owner=String(userId)===String(process.env.ADMIN_CHAT_ID)
  try {
    if(action==='track') {
      if(!UUID.test(String(sessionId)) || !['app_open','place_view','booking_form_open'].includes(eventType))return res.status(400).json({ok:false})
      const id=placeId==null?null:Number(placeId)
      if((eventType==='app_open' && id!==null) || (eventType!=='app_open' && (!Number.isSafeInteger(id) || id<1)))return res.status(400).json({ok:false})
      const ownerId=Number(process.env.ADMIN_CHAT_ID)
      const ok=await db('rpc/poimo_track_event',{method:'POST',body:JSON.stringify({p_user_id:userId,p_owner_id:Number.isSafeInteger(ownerId)?ownerId:null,p_session_id:sessionId,p_event_type:eventType,p_place_id:id})})
      return res.status(ok?200:400).json({ok:Boolean(ok)})
    }
    if(action!=='report' || !dateValid(start) || !dateValid(end) || end<start || new Date(`${end}T12:00:00Z`)-new Date(`${start}T12:00:00Z`)>365*86400000 || typeof includeTest!=='boolean')return res.status(400).json({ok:false,message:'Оберіть коректний період до 366 днів.'})
    const report=await db('rpc/poimo_analytics_report',{method:'POST',body:JSON.stringify({p_user_id:userId,p_is_owner:owner,p_start:start,p_end:end,p_include_test:includeTest})})
    if(report.forbidden)return res.status(403).json({ok:false,message:'Статистика доступна лише адміністраторам своїх закладів.'})
    return res.status(200).json(report)
  }catch{return res.status(500).json({ok:false,message:'Не вдалося завантажити статистику. Спробуйте ще раз.'})}
}
