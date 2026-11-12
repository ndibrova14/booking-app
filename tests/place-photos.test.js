import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import upload from '../api/place-photo-upload.js'
import {validatePhotoChanges,photoPublicUrl,MAX_PHOTO_BYTES} from '../api/_placePhotos.js'
process.env.SUPABASE_URL='https://database.invalid'
process.env.SUPABASE_SERVICE_KEY='test-key'
process.env.BOT_TOKEN='photo-test'
process.env.ADMIN_CHAT_ID='999'
const filename='11111111-1111-4111-8111-111111111111.jpg'
function signed(id=123){const p=new URLSearchParams({user:JSON.stringify({id}),auth_date:String(Math.floor(Date.now()/1000))});const key=crypto.createHmac('sha256','WebAppData').update(process.env.BOT_TOKEN).digest();p.set('hash',crypto.createHmac('sha256',key).update([...p.entries()].map(([k,v])=>`${k}=${v}`).sort().join('\n')).digest('hex'));return p.toString()}
async function call(body){const out={};await upload({method:'POST',body},{setHeader(){},status(code){out.status=code;return this},json(data){out.body=data;return out}});return out}
test('upload requires signed Telegram identity, size limit, and ownership before signing',async()=>{
 assert.equal((await call({placeId:1,size:100})).status,401)
 assert.equal((await call({initData:signed(),placeId:1,size:MAX_PHOTO_BYTES+1})).status,400)
 const old=globalThis.fetch
 globalThis.fetch=async(url,options={})=>{assert.equal(options.method,undefined);assert.equal(new URL(url).searchParams.get('admin_chat_id'),'eq.123');return Response.json([])}
 try{assert.equal((await call({initData:signed(),placeId:2,size:100,userId:999})).status,403)}finally{globalThis.fetch=old}
})
test('authorized upload issues a generated path and temporary URL without service credentials',async()=>{
 const old=globalThis.fetch
 globalThis.fetch=async(url,options={})=>{
  if(String(url).includes('/rest/v1/places?'))return Response.json([{id:1}])
  assert.equal(options.method,'POST')
  const path=new URL(url).pathname
  assert.match(path,/\/object\/upload\/sign\/poimo-venue-photos\/1\/[\da-f-]+\.jpg$/)
  return Response.json({url:path.replace('/storage/v1','')+'?token=test-only'})
 }
 try{const r=await call({initData:signed(),placeId:1,size:100});assert.equal(r.status,200);assert.ok(r.body.publicUrl.includes('/public/poimo-venue-photos/1/'));assert.ok(r.body.uploadUrl.includes('token='));assert.ok(!JSON.stringify(r.body).includes('test-key'))}finally{globalThis.fetch=old}
})
test('legacy photos can be reordered or removed without fetching external URLs',async()=>{
 const place={id:1,photo_url:'https://example.com/a.jpg',gallery_urls:['https://example.com/b.jpg']}
 const reordered=await validatePhotoChanges({photo_url:'https://example.com/b.jpg',gallery_urls:['https://example.com/a.jpg']},place)
 assert.equal(reordered.data.photo_url,'https://example.com/b.jpg')
 assert.deepEqual((await validatePhotoChanges({photo_url:null,gallery_urls:[]},place)).data,{photo_url:null,gallery_urls:[]})
 assert.deepEqual((await validatePhotoChanges({},place)).data,{})
})
test('photos from another venue or arbitrary host are rejected without network access',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('must not fetch')}
 try{
  for(const url of [photoPublicUrl(2,filename),'https://evil.invalid/photo.jpg',photoPublicUrl(1,filename)+'?x=1'])assert.ok((await validatePhotoChanges({photo_url:url,gallery_urls:[]},{id:1})).error)
 }finally{globalThis.fetch=old}
})
test('new photo is checked for actual upload, mime and size before attachment',async()=>{
 const old=globalThis.fetch
 let headers={'content-type':'image/jpeg','content-length':'1000'}
 globalThis.fetch=async(url,options)=>{assert.equal(options.method,'HEAD');assert.equal(options.redirect,'error');return new Response(null,{status:200,headers})}
 try{
  const fields={photo_url:photoPublicUrl(1,filename),gallery_urls:[]}
  assert.ok((await validatePhotoChanges(fields,{id:1})).data)
  headers={'content-type':'text/html','content-length':'1000'}
  assert.ok((await validatePhotoChanges(fields,{id:1})).error)
  headers={'content-type':'image/jpeg','content-length':String(MAX_PHOTO_BYTES+1)}
  assert.ok((await validatePhotoChanges(fields,{id:1})).error)
 }finally{globalThis.fetch=old}
})
test('gallery is capped at 12 and cannot contain duplicate or missing cover',async()=>{
 assert.ok((await validatePhotoChanges({photo_url:'https://example.com/a',gallery_urls:Array(12).fill('x')},{id:1})).error)
 assert.ok((await validatePhotoChanges({photo_url:null,gallery_urls:['https://example.com/a']},{id:1})).error)
 assert.ok((await validatePhotoChanges({photo_url:'https://example.com/a',gallery_urls:['https://example.com/a']},{id:1,photo_url:'https://example.com/a'})).error)
})
