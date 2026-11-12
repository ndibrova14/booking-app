import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyFilters, filterKey, filterOptions, filterPlaces, countFilters, AMENITY_FILTERS } from '../src/catalogFilters.js'
const places = [
  {id:1,name:'Roma',category:'Ресторани',district:'Поділ',cuisine:'Італійська',pet_friendly:true,hours:'open'},
  {id:2,name:'Sakura',category:'Ресторани',district:'Оболонь',cuisine:'Японська',pet_friendly:null,hours:'open'},
  {id:3,name:'Coffee',category:'Кафе',district:'Поділ',cuisine:'Кава',pet_friendly:true,hours:'closed'},
  {id:4,name:'Roma 2',category:'Ресторани',district:'  ПОДІЛ ',cuisine:'Японська',pet_friendly:true,hours:'open'},
]
const context = { category:'Усі',query:'',onlyFavorites:false,favoriteIds:[] }
const select=(filters=emptyFilters(), ctx=context)=>filterPlaces(places,filters,ctx,(hours)=>hours==='open').map((p)=>p.id)
test('empty filters preserve all places, and are independently mutable drafts',()=>{
  assert.deepEqual(select(),[1,2,3,4])
  const draft=emptyFilters();draft.districts.push('поділ')
  assert.deepEqual(emptyFilters().districts,[])
})
test('selections within group use OR; district and cuisine use AND',()=>{
  const filters={...emptyFilters(), districts:['поділ','оболонь'], cuisines:['італійська','японська']}
  assert.deepEqual(select(filters),[1,2,4])
  assert.deepEqual(select({...filters,districts:['поділ']}),[1,4])
  assert.deepEqual(select({...filters,districts:['оболонь'],cuisines:['італійська']}),[])
})
test('opening and pet-friendly both apply and unknown is not true',()=>{
  assert.deepEqual(select({...emptyFilters(),onlyOpen:true,petFriendly:true}),[1,4])
})
test('search category favorites and filters share one result',()=>{
  assert.deepEqual(select({...emptyFilters(),category:'Ресторани',districts:['поділ']},{...context,query:' ROMA ',onlyFavorites:true,favoriteIds:['4']}),[4])
})
test('options normalize case and whitespace without inventing values',()=>{
  assert.equal(filterKey('  ЛІВИЙ   БЕРЕГ '),'лівий берег')
  assert.equal(filterOptions(places,'district').length,2)
  assert.deepEqual(filterOptions([{district:null},{district:''}],'district'),[])
})
test('counts selections explicitly and reset clears all sheet groups',()=>{
  assert.equal(countFilters({...emptyFilters(),districts:['поділ','оболонь'],cuisines:['кава'],petFriendly:true,onlyOpen:true}),5)
  assert.equal(countFilters(emptyFilters()),0)
})

test('category lives in the draft, contributes to counter, and resets with sheet',()=>{
  const applied=emptyFilters()
  const draft={...applied,category:'Кафе'}
  assert.deepEqual(select(draft),[3])
  assert.equal(countFilters(draft),1)
  assert.deepEqual(select(applied),[1,2,3,4])
  assert.equal(emptyFilters().category,'Усі')
})

test('each amenity only matches the corresponding confirmed database flag',()=>{
  for (const {key,field} of AMENITY_FILTERS) {
    const candidates=[true,false,null,undefined,'true'].map((value,index)=>({id:index,name:'Test',category:'Кафе',[field]:value}))
    const result=filterPlaces(candidates,{...emptyFilters(),[key]:true},context,()=>true)
    assert.deepEqual(result.map((p)=>p.id),[0],key)
  }
})
test('multiple amenities are ANDed together and work with other filters',()=>{
  const candidates=[
    {id:1,name:'Roma',category:'Ресторани',district:'Поділ',cuisine:'Італійська',pet_friendly:true,has_terrace:true,kids_friendly:true,accessible_entrance:true},
    {id:2,name:'Roma 2',category:'Ресторани',district:'Поділ',cuisine:'Італійська',pet_friendly:true,has_terrace:true,kids_friendly:true,accessible_entrance:null},
    {id:3,name:'Coffee',category:'Кафе',district:'Поділ',cuisine:'Кава',pet_friendly:true,has_terrace:true,kids_friendly:false,accessible_entrance:true},
  ]
  const filters={...emptyFilters(),terrace:true,kidsFriendly:true}
  assert.deepEqual(filterPlaces(candidates,filters,context,()=>true).map((p)=>p.id),[1,2])
  filters.accessibleEntrance=true;filters.petFriendly=true
  assert.deepEqual(filterPlaces(candidates,filters,context,()=>true).map((p)=>p.id),[1])
  assert.deepEqual(filterPlaces(candidates,filters,{...context,onlyFavorites:true,favoriteIds:['2']},()=>true),[])
})
test('all amenity selections count and are reset independently',()=>{
  const filters=emptyFilters()
  for(const {key} of AMENITY_FILTERS)filters[key]=true
  assert.equal(countFilters(filters),4)
  assert.equal(countFilters({...filters,terrace:false}),3)
  for(const {key} of AMENITY_FILTERS)assert.equal(emptyFilters()[key],false)
})
