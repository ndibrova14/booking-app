import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import handler, { isBookingTimeOpen } from '../api/booking.js'

process.env.BOT_TOKEN = 'test-only-token'
function initData() {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 123 }) })
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest()
  p.set('hash', crypto.createHmac('sha256', secret).update([...p.entries()].map(([k,v]) => `${k}=${v}`).sort().join('\n')).digest('hex'))
  return p.toString()
}
async function request(overrides) {
  let status
  const res = { status(code) { status = code; return this }, json() { return status } }
  return handler({ method: 'POST', body: { placeId: 1, date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), time: '12:00', guests: 2, name: 'Тест', phone: '+380501234567', initData: initData(), ...overrides } }, res)
}
test('rejects unsigned booking without accessing external services', async () => {
  assert.equal(await request({ initData: '' }), 401)
})
test('rejects impossible date', async () => {
  const nextMonth = new Date()
  nextMonth.setUTCDate(1)
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
  const impossible = `${nextMonth.toISOString().slice(0, 7)}-00`
  assert.equal(await request({ date: impossible }), 400)
})
test('rejects punctuation-only phone and invalid guest count', async () => {
  assert.equal(await request({ phone: '-----' }), 400)
  assert.equal(await request({ guests: 21 }), 400)
})

test('saved booking survives Telegram failure and replay does not send or insert again', async () => {
  const originalFetch = globalThis.fetch
  process.env.SUPABASE_URL = 'https://test.invalid'
  process.env.SUPABASE_SERVICE_KEY = 'test-key'
  const records=[];let inserts=0;let messages=0
  globalThis.fetch=async(url,options={})=>{
    const u=new URL(url)
    if(String(url).includes('api.telegram.org')){messages++;return Response.json({ok:false,error_code:400},{status:400})}
    if(u.pathname.endsWith('/places'))return Response.json([{id:1,name:'Test',hours:'12:00–23:00',admin_chat_id:456}])
    if(u.pathname.endsWith('/rpc/poimo_claim_delivery'))return Response.json([{id:1,booking_id:10,kind:'new_booking',lock_token:'test-token'}])
    if(u.pathname.endsWith('/rpc/poimo_finish_delivery')){
      const done=JSON.parse(options.body)
      records[0].notification_status=done.p_state==='dead'?'failed':done.p_state
      return Response.json([{state:done.p_state}])
    }
    if(options.method==='POST'){
      inserts++;records.push({id:10,status:'new',...JSON.parse(options.body)});return Response.json(records)
    }
    return Response.json(u.searchParams.has('request_id') || u.searchParams.has('id')?records:[])
  }
  try {
    const requestId='11111111-1111-4111-8111-111111111111'
    assert.equal(await request({requestId}),200)
    assert.equal(records[0].notification_status,'failed')
    assert.equal(await request({requestId}),200)
    assert.equal(inserts,1);assert.equal(messages,1)
    assert.equal(await request({requestId,guests:3}),409)
  }finally{globalThis.fetch=originalFetch}
})

test('daily opening boundaries and overnight intervals', () => {
  for (const [hours, time, expected] of [
    ['12:00–23:00', '11:30', false],
    ['12:00–23:00', '12:00', true],
    ['12:00–23:00', '22:59', true],
    ['12:00–23:00', '23:00', false],
    ['16:00–02:00', '23:30', true],
    ['16:00–02:00', '01:30', true],
    ['16:00–02:00', '02:00', false],
    ['16:00–02:00', '12:00', false],
    ['11:00–00:00', '00:00', false],
    [' 9:00 — 18:00 ', '09:00', true],
    ['', '12:00', null],
    ['Пн 12:00–23:00', '12:00', null],
    ['25:00–26:00', '12:00', null],
    ['00:00–00:00', '12:00', null],
  ]) assert.equal(isBookingTimeOpen(hours, time), expected, `${hours} at ${time}`)
})

test('outside-hours request never inserts booking or contacts Telegram', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(options.method, undefined, 'only database reads allowed')
    assert.ok(!String(url).includes('api.telegram.org'))
    return Response.json(String(url).includes('/places?')
      ? [{ id: 1, name: 'Test', hours: '12:00–23:00' }] : [])
  }
  try { assert.equal(await request({ time: '11:30' }), 422) }
  finally { globalThis.fetch = originalFetch }
})
