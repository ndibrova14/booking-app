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
test('queued warnings skip changed statuses and do not send again after a completed claim',async()=>{
 const original=globalThis.fetch
 const states=[];let messages=0;let calls=0
 const future=new Date(Date.now()+86400000).toISOString().slice(0,10)
 globalThis.fetch=async(url,options={})=>{
  const u=String(url)
  if(u.endsWith('/rpc/poimo_queue_waiting_notices'))return Response.json(++calls===1?[{id:1},{id:2}]:[])
  if(u.endsWith('/rpc/poimo_claim_delivery')){const id=JSON.parse(options.body).p_booking_id;return Response.json([{id,booking_id:id,kind:'waiting',lock_token:'test'}])}
  if(u.endsWith('/rpc/poimo_finish_delivery')){const state=JSON.parse(options.body).p_state;states.push(state);return Response.json([{state}])}
  if(u.includes('api.telegram.org')){messages++;return Response.json({ok:true,result:{message_id:7}})}
  const id=new URL(url).searchParams.get('id')==='eq.1'?1:2
  return Response.json([{id,status:id===1?'confirmed':'new',client_tg_id:123,booking_date:future,booking_time:'12:30'}])
 }
 try{const r=await call('Bearer secret');assert.equal(r.status,200);assert.equal(r.body.sent,1);assert.deepEqual(states,['skipped','sent']);await call('Bearer secret');assert.equal(messages,1)}finally{globalThis.fetch=original}
})
test('network-uncertain delivery is recorded without an automatic immediate second send',async()=>{
 const original=globalThis.fetch
 let state;let messages=0
 const future=new Date(Date.now()+86400000).toISOString().slice(0,10)
 globalThis.fetch=async(url,options={})=>{
  const u=String(url)
  if(u.endsWith('/rpc/poimo_queue_waiting_notices'))return Response.json([{id:3}])
  if(u.endsWith('/rpc/poimo_claim_delivery'))return Response.json([{id:3,booking_id:3,kind:'waiting',lock_token:'test'}])
  if(u.endsWith('/rpc/poimo_finish_delivery')){state=JSON.parse(options.body).p_state;return Response.json([{state}])}
  if(u.includes('api.telegram.org')){messages++;throw Error('timeout')}
  return Response.json([{id:3,status:'new',client_tg_id:123,booking_date:future,booking_time:'12:30'}])
 }
 try{assert.equal((await call('Bearer secret')).status,200);assert.equal(state,'unknown');assert.equal(messages,1)}finally{globalThis.fetch=original}
})
