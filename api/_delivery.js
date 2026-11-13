import { db } from './_lib.js'

export function classifyTelegram(status, result) {
  if (status>=200 && status<300 && result?.ok===true && Number.isSafeInteger(result.result?.message_id) && result.result.message_id>0) {
    return {state:'sent',messageId:result.result.message_id}
  }
  if(result?.ok===false && Number.isInteger(result.error_code)) {
    const code=result.error_code
    if(code===429) {
      const delay=result.parameters?.retry_after
      if(delay!=null && (!Number.isSafeInteger(delay) || delay<0 || delay>86400))return {state:'dead',error:'invalid_retry_after'}
      return {state:'queued',error:'telegram_429',retryAfter:delay || 60}
    }
    if(code>=500 && code<=599)return {state:'queued',error:`telegram_${code}`}
    return {state:'dead',error:`telegram_${code}`}
  }
  return {state:'unknown',error:'unconfirmed_response'}
}
export function classifyTransportError(error) {
  const code=error?.cause?.code || error?.code
  // These failures occur before a connection exists, so no HTTP message was sent.
  if(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT'].includes(code))return {state:'queued',error:`connect_${code}`}
  return {state:'unknown',error:'delivery_uncertain'}
}
function kyivNow(date) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date)
  const get=(type)=>parts.find((p)=>p.type===type).value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
export function noticeRelevant(kind,b,now=new Date()) {
  const future=`${b.booking_date}T${String(b.booking_time).slice(0,5)}`>kyivNow(now)
  if(kind==='new_booking')return b.status==='new' && future
  if(kind==='confirmed')return b.status==='confirmed' && future
  if(kind==='rejected')return b.status==='rejected' && future
  if(kind==='cancelled_guest')return b.status==='cancelled' && b.status_source==='guest' && future
  if(kind==='cancelled_restaurant')return b.status==='cancelled' && b.status_source==='restaurant' && future
  if(kind==='reminder')return b.status==='confirmed' && b.reminder_enabled===true && future
  if(kind==='waiting')return b.status==='new' && future
  return false
}
export function waitingMessage(b) {
  return `Заклад поки не відповів ⏳\n\nЗаявка №${b.id}\nЗаклад: ${b.place_name}\nДата: ${b.booking_date}\nЧас: ${String(b.booking_time).slice(0, 5)} (Київ)\n\nМинуло понад 15 хвилин, а підтвердження ще немає. Це повідомлення не означає відмову або скасування.\n\nПеревірте актуальний статус у «Моїх бронюваннях». Можна зачекати або скасувати заявку й обрати інший заклад.`
}
export function messageFor(kind,b,adminChatId) {
  const summary=`Заявка №${b.id}\nЗаклад: ${b.place_name}\nДата: ${b.booking_date}\nЧас: ${String(b.booking_time).slice(0,5)} (Київ)\nГостей: ${b.guests}`
  if(kind==='new_booking')return {chat_id:adminChatId,text:`Нова заявка на бронювання\n\n${summary}\nІм’я: ${b.client_name}\nТелефон: ${b.client_phone}${b.client_tg_name?`\nTelegram: ${b.client_tg_name}`:''}`,
    reply_markup:{inline_keyboard:[[{text:'✅ Підтвердити',callback_data:`ok:${b.id}`},{text:'❌ Відхилити',callback_data:`no:${b.id}`}]]}}
  if(kind==='cancelled_guest')return {chat_id:adminChatId,text:`Гість скасував заявку\n\n${summary}\nІм’я: ${b.client_name}`}
  const texts={confirmed:'Ваше бронювання підтверджено ✅',rejected:'На жаль, заклад не може прийняти цю бронь ❌',cancelled_restaurant:'Заклад скасував вашу бронь. Оберіть інший заклад або зв’яжіться із закладом.',reminder:'Нагадування від «Поїмо» 🍽\n\nВаша підтверджена бронь уже скоро.'}
  return {chat_id:b.client_tg_id,text:kind==='waiting'?waitingMessage(b):`${texts[kind]}\n\n${summary}${kind==='reminder'?'\n\nЯкщо плани змінилися, скасуйте бронь у «Моїх бронюваннях».':''}`,
    reply_markup:{inline_keyboard:[[{text:'Відкрити «Поїмо»',web_app:{url:'https://booking-app-pearl-iota.vercel.app/'}}]]}}
}
async function finish(job,outcome) {
  const rows=await db('rpc/poimo_finish_delivery',{method:'POST',body:JSON.stringify({p_id:job.id,p_token:job.lock_token,p_state:outcome.state,p_error:outcome.error || null,p_retry_after:outcome.retryAfter || 0,p_message_id:outcome.messageId ?? null})})
  return rows[0]?.state || 'unknown'
}
export async function deliverJob(job) {
  let b,adminChatId
  try {
    b=(await db(`bookings?id=eq.${job.booking_id}&select=*`))[0]
    if(!b || !noticeRelevant(job.kind,b))return await finish(job,{state:'skipped',error:'no_longer_relevant'})
    if(['new_booking','cancelled_guest'].includes(job.kind)) {
      const place=(await db(`places?id=eq.${b.place_id}&select=admin_chat_id`))[0]
      adminChatId=place?.admin_chat_id || process.env.ADMIN_CHAT_ID
    }
  }catch{
    try{return await finish(job,{state:'queued',error:'context_unavailable'})}catch{return 'unknown'}
  }
  const message=messageFor(job.kind,b,adminChatId)
  if(!message.chat_id){try{return await finish(job,{state:'dead',error:'recipient_missing'})}catch{return 'unknown'}}
  let outcome
  try {
    const response=await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message),signal:AbortSignal.timeout(8000),redirect:'error',
    })
    outcome=classifyTelegram(response.status,await response.json())
  }catch(error){outcome=classifyTransportError(error)}
  // A failed acknowledgement after sending must not cause an automatic second send.
  try{return await finish(job,outcome)}catch{return 'unknown'}
}
export async function deliverFor(bookingId,kind) {
  try {
    const rows=await db('rpc/poimo_claim_delivery',{method:'POST',body:JSON.stringify({p_booking_id:bookingId,p_kind:kind})})
    if(rows.length)return await deliverJob(rows[0])
    const existing=(await db(`poimo_delivery_jobs?booking_id=eq.${bookingId}&kind=eq.${kind}&select=state&limit=1`))[0]
    return existing?.state || 'unknown'
  }catch{return 'unknown'}
}
export function publicDeliveryState(state) {
  return state==='dead'?'failed':state==='processing'?'sending':state==='queued'?'retrying':state
}
