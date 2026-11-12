import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contactKey, telegramContactId, readContact, writeContact, forgetContact } from '../src/bookingContact.js'
function memory() {
  const values = new Map()
  return { getItem:(key)=>values.get(key) ?? null, setItem:(key,value)=>values.set(key,value), removeItem:(key)=>values.delete(key) }
}
test('saved contacts are isolated by Telegram account and can be forgotten independently',()=>{
  const storage=memory()
  assert.equal(writeContact(123,{name:' Назар ',phone:' +380501234567 '},storage),true)
  assert.deepEqual(readContact(123,storage).contact,{name:'Назар',phone:'+380501234567'})
  assert.equal(readContact(456,storage).contact,null)
  writeContact(456,{name:'Інший',phone:'+380671234567'},storage)
  assert.equal(forgetContact(123,storage),true)
  assert.equal(readContact(123,storage).contact,null)
  assert.equal(readContact(456,storage).contact.name,'Інший')
})
test('edited saved fields replace previous values',()=>{
  const storage=memory()
  writeContact(123,{name:'Old',phone:'+380501234567'},storage)
  writeContact(123,{name:'New',phone:'+380671234567'},storage)
  assert.deepEqual(readContact(123,storage).contact,{name:'New',phone:'+380671234567'})
})
test('unavailable storage never blocks booking logic by throwing',()=>{
  const storage={getItem(){throw Error('blocked')},setItem(){throw Error('quota')},removeItem(){throw Error('blocked')}}
  assert.deepEqual(readContact(123,storage),{contact:null,available:false})
  assert.equal(writeContact(123,{name:'Test',phone:'+380501234567'},storage),false)
  assert.equal(forgetContact(123,storage),false)
})
test('invalid saved data is never used as form defaults',()=>{
  const storage=memory()
  storage.setItem(contactKey(123),'{bad json')
  assert.equal(readContact(123,storage).contact,null)
  storage.setItem(contactKey(123),JSON.stringify({name:[],phone:'+380501234567'}))
  assert.equal(readContact(123,storage).contact,null)
  assert.equal(writeContact(123,{name:'',phone:'bad'},storage),false)
  assert.equal(contactKey(null),null)
})
test('account key is obtained from Telegram user data, with no shared guest fallback',()=>{
  const input=new URLSearchParams({user:JSON.stringify({id:123})}).toString()
  assert.equal(telegramContactId(input),123)
  assert.equal(telegramContactId(''),null)
  assert.equal(telegramContactId('user=bad'),null)
  assert.equal(telegramContactId(new URLSearchParams({user:JSON.stringify({id:-1})}).toString()),null)
})
