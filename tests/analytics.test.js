import {test} from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import handler from '../api/analytics.js'
import {conversionPercent,responseLabel,dateShift} from '../src/statsHelpers.js'
process.env.BOT_TOKEN='stats-test'
process.env.SUPABASE_URL='https://database.invalid'
process.env.SUPABASE_SERVICE_KEY='test-key'
process.env.ADMIN_CHAT_ID='999'
function signed(id=123){const p=new URLSearchParams({user:JSON.stringify({id}),auth_date:String(Math.floor(Date.now()/1000))});const key=crypto.createHmac('sha256','WebAppData').update(process.env.BOT_TOKEN).digest();p.set('hash',crypto.createHmac('sha256',key).update([...p.entries()].map(([k,v])=>`${k}=${v}`).sort().join('\n')).digest('hex'));return p.toString()}
async function call(body){const result={};await handler({method:'POST',body},{setHeader(){},status(code){result.status=code;return this},json(data){result.body=data;return result}});return result}
test('analytics requires signed Telegram identity',async()=>{assert.equal((await call({action:'report',start:'2026-11-01',end:'2026-11-13'})).status,401)})
test('report uses signed identity and server owner flag, never client privilege claims',async()=>{
 const old=globalThis.fetch;let args
 globalThis.fetch=async(url,options)=>{assert.ok(String(url).endsWith('/rpc/poimo_analytics_report'));args=JSON.parse(options.body);return Response.json({ok:true,summary:{}})}
 try{
  assert.equal((await call({action:'report',initData:signed(),start:'2026-11-01',end:'2026-11-13',isOwner:true,userId:999})).status,200)
  assert.equal(args.p_user_id,123);assert.equal(args.p_is_owner,false)
  await call({action:'report',initData:signed(999),start:'2026-11-01',end:'2026-11-13'});assert.equal(args.p_is_owner,true)
 }finally{globalThis.fetch=old}
})
test('date validation rejects impossible and reversed periods',async()=>{
 for(const [start,end] of [['2026-02-30','2026-03-01'],['2026-11-13','2026-11-01'],['2024-01-01','2026-11-13']])assert.equal((await call({action:'report',initData:signed(),start,end})).status,400)
})
test('tracking ignores forged test flag and validates event type and venue',async()=>{
 const old=globalThis.fetch
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.p_user_id,123);assert.equal(body.p_owner_id,999);assert.equal(Object.hasOwn(body,'p_is_test'),false);return Response.json(true)}
 try{
  const base={action:'track',initData:signed(),sessionId:crypto.randomUUID()}
  assert.equal((await call({...base,eventType:'app_open',isTest:false})).status,200)
  assert.equal((await call({...base,eventType:'booking_form_open',placeId:2})).status,200)
  assert.equal((await call({...base,eventType:'app_open',placeId:2})).status,400)
  assert.equal((await call({...base,eventType:'wrong'})).status,400)
 }finally{globalThis.fetch=old}
})
test('non-manager is denied aggregate report',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({forbidden:true})
 try{assert.equal((await call({action:'report',initData:signed(),start:'2026-11-01',end:'2026-11-13'})).status,403)}finally{globalThis.fetch=old}
})
test('formats zero denominators and typical response time without misleading zeros',()=>{
 assert.equal(conversionPercent({visitors:0,converted_visitors:0}),null)
 assert.equal(conversionPercent({visitors:8,converted_visitors:2}),25)
 assert.equal(responseLabel(null),'—');assert.equal(responseLabel(0.4),'< 1 хв');assert.equal(responseLabel(119.9),'2 год 0 хв')
 assert.equal(dateShift('2026-03-01',-1),'2026-02-28')
})
test('frontend deduplicates repeated interactions and records an opening before venue events',async()=>{
 const oldFetch=globalThis.fetch,oldWindow=globalThis.window
 const events=[]
 globalThis.window={Telegram:{WebApp:{initData:'test-data'}}}
 globalThis.fetch=async(url,options)=>{events.push(JSON.parse(options.body));return Response.json({ok:true})}
 try{
  const analytics=await import(`../src/analytics.js?test=${crypto.randomUUID()}`)
  analytics.trackEvent('app_open');analytics.trackEvent('app_open');analytics.trackEvent('place_view',1);analytics.trackEvent('place_view',1);analytics.trackEvent('booking_form_open',1)
  await new Promise((resolve)=>setTimeout(resolve,0))
  assert.deepEqual(events.map((event)=>event.eventType),['app_open','place_view','booking_form_open'])
  assert.equal(new Set(events.map((event)=>event.sessionId)).size,1)
 }finally{globalThis.fetch=oldFetch;globalThis.window=oldWindow}
})
