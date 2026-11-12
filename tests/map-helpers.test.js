import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coordinates, routeUrl, markerSvg } from '../src/mapHelpers.js'
test('coordinates accept numeric values and strings but reject missing and invalid values',()=>{
  assert.deepEqual(coordinates({lat:'50.45',lng:'30.52'}),[50.45,30.52])
  assert.deepEqual(coordinates({lat:0,lng:0}),[0,0])
  for(const value of [null,{}, {lat:null,lng:30},{lat:' ',lng:30},{lat:91,lng:30},{lat:50,lng:181},{lat:'bad',lng:30},{lat:Infinity,lng:30},{lat:false,lng:30}]) assert.equal(coordinates(value),null)
})
test('route opens directions to venue without transmitting visitor location',()=>{
  const url=new URL(routeUrl({lat:50.45,lng:30.52}))
  assert.equal(url.origin,'https://www.google.com')
  assert.equal(url.searchParams.get('api'),'1')
  assert.equal(url.searchParams.get('destination'),'50.45,30.52')
  assert.equal(url.searchParams.has('origin'),false)
  assert.equal(routeUrl({lat:null,lng:null}),null)
})
test('marker markup uses only fixed icons, never interpolates untrusted categories',()=>{
  assert.ok(markerSvg('Кафе').startsWith('<svg'))
  assert.notEqual(markerSvg('Кафе'),markerSvg('Ресторани'))
  assert.equal(markerSvg('<img src=x onerror=alert(1)>'),markerSvg('unknown'))
  assert.equal(markerSvg('__proto__'),markerSvg('unknown'))
  assert.ok(!markerSvg('<script>evil()</script>').includes('evil'))
})
