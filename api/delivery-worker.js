import crypto from 'node:crypto'
import { db } from './_lib.js'
import { deliverJob } from './_delivery.js'
export const config={maxDuration:60}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST')return res.status(405).json({ok:false})
  const secret=process.env.REMINDER_SECRET
  const a=Buffer.from(`Bearer ${secret || ''}`),b=Buffer.from(String(req.headers.authorization || ''))
  if(!secret || a.length!==b.length || !crypto.timingSafeEqual(a,b))return res.status(401).json({ok:false})
  let processed=0,sent=0
  const started=Date.now()
  try{
    while(processed<4 && Date.now()-started<40000) {
      const rows=await db('rpc/poimo_claim_delivery',{method:'POST',body:'{}'})
      if(!rows.length)break
      const state=await deliverJob(rows[0]);processed++;if(state==='sent')sent++
    }
    return res.status(200).json({ok:true,processed,sent})
  }catch{return res.status(500).json({ok:false,processed,sent})}
}
