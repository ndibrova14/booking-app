import {test} from 'node:test'
import assert from 'node:assert/strict'
import {classifyTelegram,classifyTransportError,noticeRelevant,deliverFor,messageFor} from '../api/_delivery.js'
import worker from '../api/delivery-worker.js'
process.env.SUPABASE_URL='https://database.invalid'
process.env.SUPABASE_SERVICE_KEY='test-key'
process.env.BOT_TOKEN='test-token'
test('only explicit temporary Telegram errors retry; ambiguous transport and HTML never do',()=>{
 assert.equal(classifyTelegram(200,{ok:true,result:{message_id:1}}).state,'sent')
 assert.deepEqual(classifyTelegram(429,{ok:false,error_code:429,parameters:{retry_after:120}}),{state:'queued',error:'telegram_429',retryAfter:120})
 assert.equal(classifyTelegram(503,{ok:false,error_code:503}).state,'queued')
 for(const code of [400,401,403])assert.equal(classifyTelegram(code,{ok:false,error_code:code}).state,'dead')
 assert.equal(classifyTelegram(502,null).state,'unknown')
 assert.equal(classifyTelegram(200,{ok:true}).state,'unknown')
})
test('outdated messages cannot confirm cancelled bookings or remind about a past visit',()=>{
 const now=new Date('2026-11-13T12:00:00Z')
 const b={status:'confirmed',reminder_enabled:true,booking_date:'2026-11-14',booking_time:'18:00'}
 assert.equal(noticeRelevant('reminder',b,now),true)
 assert.equal(noticeRelevant('confirmed',{...b,status:'cancelled'},now),false)
 assert.equal(noticeRelevant('reminder',{...b,booking_date:'2026-11-12'},now),false)
 assert.equal(noticeRelevant('waiting',b,now),false)
})
test('message shows stable booking number and uses explicit recipient',()=>{
 const result=messageFor('new_booking',{id:123,booking_time:'12:00',client_phone:'test'},456)
 assert.equal(result.chat_id,456);assert.ok(result.text.includes('№123'));assert.equal(result.reply_markup.inline_keyboard[0][0].callback_data,'ok:123')
})
test('failed acknowledgement after a successful send never causes a second immediate send',async()=>{
 const old=globalThis.fetch
 let claimed=false,messages=0
 const future=new Date(Date.now()+86400000).toISOString().slice(0,10)
 globalThis.fetch=async(url)=>{
  const u=String(url)
  if(u.endsWith('/rpc/poimo_claim_delivery')){if(claimed)return Response.json([]);claimed=true;return Response.json([{id:1,booking_id:1,kind:'confirmed',lock_token:'test'}])}
  if(u.endsWith('/rpc/poimo_finish_delivery'))throw Error('database response lost')
  if(u.includes('/poimo_delivery_jobs?'))return Response.json([{state:'processing'}])
  if(u.includes('api.telegram.org')){messages++;return Response.json({ok:true,result:{message_id:10}})}
  return Response.json([{id:1,status:'confirmed',client_tg_id:321,booking_date:future,booking_time:'12:00'}])
 }
 try{assert.equal(await deliverFor(1,'confirmed'),'unknown');assert.equal(await deliverFor(1,'confirmed'),'processing');assert.equal(messages,1)}finally{globalThis.fetch=old}
})
test('worker is protected by existing reminder secret',async()=>{
 process.env.REMINDER_SECRET='secret'
 let status
 await worker({method:'POST',headers:{authorization:'Bearer wrong'}},{setHeader(){},status(code){status=code;return this},json(){}})
 assert.equal(status,401)
})

test('pre-connect DNS failures can retry, but disconnect and request timeout remain uncertain',()=>{
 assert.equal(classifyTransportError({cause:{code:'EAI_AGAIN'}}).state,'queued')
 assert.equal(classifyTransportError({cause:{code:'UND_ERR_CONNECT_TIMEOUT'}}).state,'queued')
 assert.equal(classifyTransportError({cause:{code:'ECONNRESET'}}).state,'unknown')
 assert.equal(classifyTransportError({name:'TimeoutError'}).state,'unknown')
})
