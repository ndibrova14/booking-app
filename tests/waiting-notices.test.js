import { test } from 'node:test'
import assert from 'node:assert/strict'
import handler, { waitingMessage } from '../api/waiting-notices.js'
process.env.SUPABASE_URL = 'https://database.invalid'
process.env.SUPABASE_SERVICE_KEY = 'test-key'
process.env.BOT_TOKEN = 'test-token'
async function call(authorization) {
  const result={}
  await handler({method:'POST',headers:{authorization}}, {setHeader(){},status(code){result.status=code;return this},json(data){result.body=data;return result}})
  return result
}
test('waiting checks reject unconfigured and incorrect secret',async()=>{
  delete process.env.REMINDER_SECRET
  assert.equal((await call('Bearer secret')).status,401)
  process.env.REMINDER_SECRET='secret'
  assert.equal((await call('Bearer bad')).status,401)
})
test('notification explains pending status without claiming cancellation',()=>{
  const text=waitingMessage({id:10,place_name:'Test',booking_date:'2026-12-01',booking_time:'12:30:00'})
  assert.ok(text.includes('15 хвилин'))
  assert.ok(text.includes('не означає відмову або скасування'))
  assert.ok(text.includes('Моїх бронюваннях'))
  assert.ok(text.includes('12:30'))
})
test('changed statuses are skipped; one pending guest is notified without mutating booking status',async()=>{
  const original=globalThis.fetch
  const updates=[];let messages=0;let claims=0
  globalThis.fetch=async(url,options={})=>{
    const u=String(url)
    if(u.endsWith('/rpc/poimo_claim_waiting_notices')){
      claims++
      return Response.json(claims===1?[{id:1},{id:2,client_tg_id:123,place_name:'Test',booking_date:'2026-12-01',booking_time:'12:30'}]:[])
    }
    if(options.method==='PATCH'){
      const data=JSON.parse(options.body)
      assert.equal(Object.hasOwn(data,'status'),false)
      updates.push(data)
      return new Response(null,{status:204})
    }
    if(u.includes('api.telegram.org')){
      messages++
      assert.equal(JSON.parse(options.body).chat_id,123)
      return Response.json({ok:true})
    }
    assert.ok(u.includes('status=eq.new'))
    return Response.json(u.includes('id=eq.1&')?[]:[{id:2}])
  }
  try{
    const r=await call('Bearer secret')
    assert.equal(r.status,200);assert.equal(r.body.sent,1)
    assert.equal(updates[0].waiting_notice_state,'skipped')
    assert.equal(updates[1].waiting_notice_state,'sent')
    assert.ok(updates[1].waiting_notice_sent_at)
    await call('Bearer secret')
    assert.equal(messages,1)
  }finally{globalThis.fetch=original}
})
test('network-uncertain delivery is recorded without automatic duplicate attempts',async()=>{
  const original=globalThis.fetch
  let update;let attempts=0
  globalThis.fetch=async(url,options={})=>{
    const u=String(url)
    if(u.endsWith('/rpc/poimo_claim_waiting_notices'))return Response.json([{id:3,client_tg_id:123,booking_time:'12:30'}])
    if(options.method==='PATCH'){update=JSON.parse(options.body);return new Response(null,{status:204})}
    if(u.includes('api.telegram.org')){attempts++;throw Error('timeout')}
    return Response.json([{id:3}])
  }
  try{
    assert.equal((await call('Bearer secret')).status,200)
    assert.equal(update.waiting_notice_state,'unknown')
    assert.equal(attempts,1)
  }finally{globalThis.fetch=original}
})
