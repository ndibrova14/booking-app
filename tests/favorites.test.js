import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import handler from '../api/favorites.js'
process.env.BOT_TOKEN = 'test-favorites'
process.env.SUPABASE_URL = 'https://database.invalid'
process.env.SUPABASE_SERVICE_KEY = 'test-key'
function signed(id=123) {
  const p = new URLSearchParams({user: JSON.stringify({id}), auth_date:String(Math.floor(Date.now()/1000))})
  const key = crypto.createHmac('sha256','WebAppData').update(process.env.BOT_TOKEN).digest()
  p.set('hash',crypto.createHmac('sha256',key).update([...p.entries()].map(([k,v])=>`${k}=${v}`).sort().join('\n')).digest('hex'))
  return p.toString()
}
async function call(body) {
  const result={}
  await handler({method:'POST',body}, {setHeader(){},status(code){result.status=code;return this},json(data){result.body=data;return result}})
  return result
}
test('favorites require signed Telegram identity',async()=> {
  assert.equal((await call({action:'list',userId:123})).status,401)
})
test('list scopes to authenticated user regardless of spoofed body',async()=> {
  const old=globalThis.fetch
  globalThis.fetch=async(url)=> {
    assert.equal(new URL(url).searchParams.get('client_tg_id'),'eq.123')
    return Response.json([{place_id:1}])
  }
  try {assert.deepEqual((await call({action:'list',initData:signed(),userId:999})).body.ids,[1])}
  finally{globalThis.fetch=old}
})
test('set is explicit, duplicate-safe and never trusts a client user id',async()=> {
  const old=globalThis.fetch
  let inserts=0
  globalThis.fetch=async(url,options={})=> {
    if(String(url).includes('/places?'))return Response.json([{id:1}])
    assert.equal(options.method,'POST')
    assert.equal(options.headers.Prefer,'resolution=ignore-duplicates,return=minimal')
    assert.deepEqual(JSON.parse(options.body),{client_tg_id:123,place_id:1})
    inserts++;return new Response(null,{status:204})
  }
  try {
    const body={action:'set',saved:true,placeId:1,initData:signed(),userId:999}
    assert.equal((await call(body)).status,200)
    assert.equal((await call(body)).status,200)
    assert.equal(inserts,2)
  }finally{globalThis.fetch=old}
})
test('removal only deletes the signed user’s selected place',async()=> {
  const old=globalThis.fetch
  globalThis.fetch=async(url,options)=> {
    const query=new URL(url).searchParams
    assert.equal(query.get('client_tg_id'),'eq.123')
    assert.equal(query.get('place_id'),'eq.1')
    assert.equal(options.method,'DELETE')
    return new Response(null,{status:204})
  }
  try{assert.equal((await call({action:'set',saved:false,placeId:1,initData:signed()})).status,200)}
  finally{globalThis.fetch=old}
})
test('inactive places cannot be added; malformed input rejected',async()=> {
  const old=globalThis.fetch
  globalThis.fetch=async()=>Response.json([])
  try {
    assert.equal((await call({action:'set',saved:true,placeId:1,initData:signed()})).status,404)
    assert.equal((await call({action:'set',saved:'true',placeId:1,initData:signed()})).status,400)
    assert.equal((await call({action:'set',saved:true,placeId:-1,initData:signed()})).status,400)
  }finally{globalThis.fetch=old}
})
