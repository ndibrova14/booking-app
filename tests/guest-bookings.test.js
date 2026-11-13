import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import guest from '../api/my-bookings.js'
import reminders from '../api/reminders.js'
process.env.BOT_TOKEN = 'test-token'
process.env.SUPABASE_URL = 'https://database.invalid'
process.env.SUPABASE_SERVICE_KEY = 'test-key'
function signed() {
  const p = new URLSearchParams({ user: JSON.stringify({ id: 123 }), auth_date: String(Math.floor(Date.now()/1000)) })
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest()
  p.set('hash', crypto.createHmac('sha256', secret).update([...p.entries()].map(([k,v])=>`${k}=${v}`).sort().join('\n')).digest('hex'))
  return p.toString()
}
async function call(handler, body, headers = {}) {
  const result = {}
  const res = { setHeader() {}, status(code) { result.status=code; return this }, json(data) { result.body=data; return result } }
  await handler({ method: 'POST', body, headers }, res)
  return result
}
test('guest cannot read without Telegram authentication', async () => {
  assert.equal((await call(guest, { action:'list', userId:999 })).status, 401)
})
test('guest identity comes from signed Telegram data and personal response is limited', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).endsWith('/rpc/poimo_guest_bookings_v2'))
    assert.deepEqual(JSON.parse(options.body), { p_user_id:123, p_offset:0 })
    return Response.json(Array.from({length:51}, (_,i)=>({id:i})))
  }
  try {
    const r=await call(guest,{ action:'list', initData:signed(), userId:999 })
    assert.equal(r.status,200); assert.equal(r.body.bookings.length,50); assert.equal(r.body.hasMore,true)
  } finally { globalThis.fetch=original }
})
test('unsuccessful cancellation never sends a message', async () => {
  const original=globalThis.fetch
  globalThis.fetch=async(url, options)=> {
    assert.ok(String(url).endsWith('/rpc/poimo_guest_cancel_delivery'))
    assert.deepEqual(JSON.parse(options.body),{p_user_id:123,p_booking_id:10})
    return Response.json([])
  }
  try { assert.equal((await call(guest,{action:'cancel', bookingId:10, initData:signed()})).status,409) }
  finally { globalThis.fetch=original }
})
test('saved cancellation remains successful when queue acknowledgement fails',async()=>{
 const original=globalThis.fetch
 globalThis.fetch=async(url)=>{
  if(String(url).endsWith('/rpc/poimo_guest_cancel_delivery'))return Response.json([{id:10}])
  throw Error('queue unavailable')
 }
 try{const r=await call(guest,{action:'cancel',bookingId:10,initData:signed()});assert.equal(r.status,200);assert.equal(r.body.notified,false)}finally{globalThis.fetch=original}
})
test('reminder endpoint requires configured secret',async()=> {
  delete process.env.REMINDER_SECRET
  assert.equal((await call(reminders,{})).status,401)
  process.env.REMINDER_SECRET='test-secret'
  assert.equal((await call(reminders,{}, {authorization:'Bearer wrong'})).status,401)
})
test('queued reminder skips cancelled booking and marks accepted Telegram delivery',async()=>{
 const original=globalThis.fetch
 const states=[];let messages=0
 const future=new Date(Date.now()+86400000).toISOString().slice(0,10)
 globalThis.fetch=async(url,options={})=>{
  const u=String(url)
  if(u.endsWith('/rpc/poimo_queue_reminders'))return Response.json([{id:1},{id:2}])
  if(u.endsWith('/rpc/poimo_claim_delivery')){const id=JSON.parse(options.body).p_booking_id;return Response.json([{id,booking_id:id,kind:'reminder',lock_token:'test'}])}
  if(u.endsWith('/rpc/poimo_finish_delivery')){const state=JSON.parse(options.body).p_state;states.push(state);return Response.json([{state}])}
  if(u.includes('api.telegram.org')){messages++;return Response.json({ok:true,result:{message_id:7}})}
  const id=new URL(url).searchParams.get('id')==='eq.1'?1:2
  return Response.json([{id,status:id===1?'cancelled':'confirmed',reminder_enabled:true,booking_date:future,booking_time:'12:00',client_tg_id:123}])
 }
 try{const r=await call(reminders,{}, {authorization:'Bearer test-secret'});assert.equal(r.body.sent,1);assert.equal(messages,1);assert.deepEqual(states,['skipped','sent'])}finally{globalThis.fetch=original}
})
