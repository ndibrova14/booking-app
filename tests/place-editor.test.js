import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import handler from '../api/place-editor.js'
import {validatePlaceEdit} from '../api/_placeEditor.js'
process.env.BOT_TOKEN='editor-test'
process.env.SUPABASE_URL='https://database.invalid'
process.env.SUPABASE_SERVICE_KEY='test-key'
process.env.ADMIN_CHAT_ID='999'
const fields={name:'Roma',category:'Ресторани',cuisine:'Італійська',description:'Опис',average_check:500,menu_url:'https://example.com/menu',hours:'16:00–02:00',pet_friendly:true,has_terrace:null,kids_friendly:false,accessible_entrance:null,visit_notes:'',pet_notes:''}
function signed(id=123){
 const p=new URLSearchParams({user:JSON.stringify({id}),auth_date:String(Math.floor(Date.now()/1000))})
 const key=crypto.createHmac('sha256','WebAppData').update(process.env.BOT_TOKEN).digest()
 p.set('hash',crypto.createHmac('sha256',key).update([...p.entries()].map(([k,v])=>`${k}=${v}`).sort().join('\n')).digest('hex'))
 return p.toString()
}
async function call(body){const r={};await handler({method:'POST',body},{setHeader(){},status(code){r.status=code;return this},json(data){r.body=data;return r}});return r}
test('server validates overnight schedule, tri-state amenities and clearing optional fields',()=>{
 const r=validatePlaceEdit(fields)
 assert.equal(r.data.hours,'16:00–02:00');assert.equal(r.data.has_terrace,null);assert.equal(r.data.kids_friendly,false);assert.equal(r.data.pet_notes,null)
 assert.equal(validatePlaceEdit({...fields,average_check:null}).data.average_check,null)
})
test('forbidden fields, invalid time, unsafe menu and false string are rejected',()=>{
 for(const extra of [{admin_chat_id:999},{is_active:true},{lat:50},{photo_url:'https://example.com/x'}]) assert.ok(validatePlaceEdit({...fields,...extra}).error)
 for(const hours of ['24:00–03:00','12:00–12:00','Пн 12:00–23:00'])assert.ok(validatePlaceEdit({...fields,hours}).error)
 assert.ok(validatePlaceEdit({...fields,menu_url:'javascript:alert(1)'}).error)
 assert.ok(validatePlaceEdit({...fields,pet_friendly:'true'}).error)
 assert.ok(validatePlaceEdit({...fields,average_check:-1}).error)
})
test('unauthenticated requests cannot open editor',async()=>{assert.equal((await call({action:'list'})).status,401)})
test('restaurant listing is scoped to signed admin; owner can list all',async()=>{
 const old=globalThis.fetch
 let admin
 globalThis.fetch=async(url)=>{admin=new URL(url).searchParams.get('admin_chat_id');return Response.json([])}
 try{
  await call({action:'list',initData:signed(),userId:999});assert.equal(admin,'eq.123')
  await call({action:'list',initData:signed(999)});assert.equal(admin,null)
 }finally{globalThis.fetch=old}
})
test('cannot save somebody else’s place even with forged user id',async()=>{
 const old=globalThis.fetch
 globalThis.fetch=async(url,options={})=>{assert.equal(options.method,undefined);assert.equal(new URL(url).searchParams.get('admin_chat_id'),'eq.123');return Response.json([])}
 try{assert.equal((await call({action:'save',placeId:1,version:0,fields,initData:signed(),userId:999})).status,403)}finally{globalThis.fetch=old}
})
test('save includes ownership and version in atomic condition; stale edit is rejected',async()=>{
 const old=globalThis.fetch
 let saved
 globalThis.fetch=async(url,options={})=>{
  const q=new URL(url).searchParams
  assert.equal(q.get('admin_chat_id'),'eq.123')
  if(options.method==='PATCH'){
   assert.equal(q.get('editor_version'),'eq.0')
   saved=JSON.parse(options.body)
   assert.equal(saved.editor_version,1);assert.equal(Object.hasOwn(saved,'admin_chat_id'),false)
   return Response.json([])
  }
  return Response.json([{id:1,editor_version:1}])
 }
 try{const r=await call({action:'save',placeId:1,version:0,fields,initData:signed()});assert.equal(r.status,409);assert.ok(saved)}finally{globalThis.fetch=old}
})
test('successful update returns edited record',async()=>{
 const old=globalThis.fetch
 globalThis.fetch=async(url,options={})=>Response.json(options.method==='PATCH'?[{id:1,...fields,editor_version:1}]:[{id:1,editor_version:0}])
 try{const r=await call({action:'save',placeId:1,version:0,fields,initData:signed()});assert.equal(r.status,200);assert.equal(r.body.place.editor_version,1)}finally{globalThis.fetch=old}
})
