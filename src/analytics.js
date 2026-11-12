// One opening per app load; a new visit starts after 30 minutes without a tracked interaction.
let sessionId=null
let lastActive=0
const tracked=new Set()
const pending=[]
let timer=null
function ensureSession() {
  if(!sessionId || Date.now()-lastActive>30*60*1000){sessionId=crypto.randomUUID();tracked.clear()}
  lastActive=Date.now()
  return sessionId
}
export function flushAnalytics() {
  if(timer!==null){clearTimeout(timer);timer=null}
  return Promise.all(pending.splice(0).map(async(body)=>{
    async function send() {
      try {
        const response=await fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true,signal:AbortSignal.timeout(10000)})
        return response.ok
      }catch{return false}
    }
    // Database uniqueness makes retrying an uncertain write safe.
    if(!await send())await send()
  }))
}
export function trackEvent(eventType,placeId=null) {
  const initData=window.Telegram?.WebApp?.initData
  if(!initData)return
  const session=ensureSession()
  if(eventType!=='app_open' && !tracked.has('app_open:'))trackEvent('app_open')
  const key=`${eventType}:${placeId ?? ''}`
  if(tracked.has(key))return
  tracked.add(key)
  pending.push(JSON.stringify({action:'track',initData,eventType,placeId,sessionId:session}))
  // Give catalogue data and visible resources priority during startup.
  if(timer===null)timer=setTimeout(()=>{timer=null;void flushAnalytics()},1200)
}
if(typeof window!=='undefined' && typeof document!=='undefined') {
  window.addEventListener('pagehide',()=>{void flushAnalytics()})
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void flushAnalytics()})
}
