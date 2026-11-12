// One opening per app load; a new visit starts after 30 minutes without a tracked interaction.
let sessionId=null
let lastActive=0
const tracked=new Set()
function ensureSession() {
  if(!sessionId || Date.now()-lastActive>30*60*1000){sessionId=crypto.randomUUID();tracked.clear()}
  lastActive=Date.now()
  return sessionId
}
export function trackEvent(eventType,placeId=null) {
  const initData=window.Telegram?.WebApp?.initData
  if(!initData)return
  const session=ensureSession()
  // Automatically record opening if an interaction starts a new session.
  if(eventType!=='app_open' && !tracked.has('app_open:'))trackEvent('app_open')
  const key=`${eventType}:${placeId ?? ''}`
  if(tracked.has(key))return
  tracked.add(key)
  const body=JSON.stringify({action:'track',initData,eventType,placeId,sessionId:session})
  async function send() {
    try {
      const response=await fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true,signal:AbortSignal.timeout(10000)})
      return response.ok
    }catch{return false}
  }
  // A retry is safe: the database deduplicates events by user, session, type and venue.
  send().then((ok)=>{if(!ok)send()})
}
