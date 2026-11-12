import { test } from 'node:test'
import assert from 'node:assert/strict'
import { averageCheckLabel, galleryPhotos, publicUrl, venueAmenities } from '../src/placeDetails.js'
test('public links accept only http(s) without embedded credentials',()=>{
  assert.equal(publicUrl('javascript:alert(1)'),null)
  assert.equal(publicUrl('data:text/html,test'),null)
  assert.equal(publicUrl('https://user:pass@example.com/menu'),null)
  assert.equal(publicUrl(null),null)
  assert.equal(publicUrl(' https://example.com/menu '),'https://example.com/menu')
})
test('gallery deduplicates cover and additional photos and caps size',()=>{
  assert.deepEqual(galleryPhotos({photo_url:'https://example.com/1.jpg',gallery_urls:['https://example.com/1.jpg','bad','https://example.com/2.jpg']}),['https://example.com/1.jpg','https://example.com/2.jpg'])
  assert.deepEqual(galleryPhotos({gallery_urls:null}),[])
  assert.equal(galleryPhotos({gallery_urls:Array.from({length:20},(_,i)=>`https://example.com/${i}`)}).length,12)
})
test('unconfirmed amenities and absent prices never create positive claims',()=>{
  assert.deepEqual(venueAmenities({pet_friendly:null,has_terrace:false,kids_friendly:'true',accessible_entrance:null}),[])
  assert.deepEqual(venueAmenities({pet_friendly:true,accessible_entrance:true}),['Можна з тваринами','Безбар’єрний вхід'])
  for(const value of [null,undefined,0,-100,'500',Infinity])assert.equal(averageCheckLabel(value),null)
  assert.match(averageCheckLabel(500),/500 грн \/ людина/)
})
