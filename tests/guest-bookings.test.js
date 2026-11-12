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
    assert.ok(String(url).endsWith('/rpc/poimo_guest_cancel'))
    assert.deepEqual(JSON.parse(options.body),{p_user_id:123,p_booking_id:10})
    return Response.json([])
  }
  try { assert.equal((await call(guest,{action:'cancel', bookingId:10, initData:signed()})).status,409) }
  finally { globalThis.fetch=original }
})
test('saved cancellation remains successful when restaurant delivery fails', async () => {
  const original=globalThis.fetch
  globalThis.fetch=async(url)=> {
    if(String(url).endsWith('/rpc/poimo_guest_cancel')) return Response.json([{id:10,place_id:1,place_name:'Test',booking_date:'2026-12-01',booking_time:'12:00',guests:2,client_name:'Test'}])
    if(String(url).includes('/places?')) return Response.json([{admin_chat_id:456}])
    return Response.json({ok:false},{status:400})
  }
  try { const r=await call(guest,{action:'cancel', bookingId:10,initData:signed()}); assert.equal(r.status,200);assert.equal(r.body.notified,false) }
  finally {globalThis.fetch=original}
})
test('reminder endpoint requires configured secret',async()=> {
  delete process.env.REMINDER_SECRET
  assert.equal((await call(reminders,{})).status,401)
  process.env.REMINDER_SECRET='test-secret'
  assert.equal((await call(reminders,{}, {authorization:'Bearer wrong'})).status,401)
})
test('claimed cancelled booking is skipped; delivered reminder is marked sent',async()=> {
  const original=globalThis.fetch
  const updates=[]; let messages=0
  globalThis.fetch=async(url,options={})=> {
    const u=String(url)
    if(u.endsWith('/rpc/poimo_claim_reminders')) return Response.json([{id:1},{id:2,client_tg_id:123,place_name:'Test',booking_date:'2026-12-01',booking_time:'12:00',guests:2}])
    if(options.method==='PATCH') {updates.push(JSON.parse(options.body));return new Response(null,{status:204})}
    if(u.includes('api.telegram.org')) {messages++; return Response.json({ok:true})}
    return Response.json(u.includes('id=eq.1&')?[]:[{id:2}])
  }
  try {
    const r=await call(reminders,{}, {authorization:'Bearer test-secret'})
    assert.equal(r.body.sent,1);assert.equal(messages,1)
    assert.equal(updates[0].reminder_state,'skipped');assert.equal(updates[1].reminder_state,'sent')
  } finally {globalThis.fetch=original}
})
