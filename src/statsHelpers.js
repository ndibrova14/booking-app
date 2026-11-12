export function dateShift(date,days) {
  const value=new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate()+days)
  return value.toISOString().slice(0,10)
}
export function conversionPercent(metrics) {
  return metrics.visitors>0?Math.round(1000*metrics.converted_visitors/metrics.visitors)/10:null
}
export function percentLabel(value) {
  return value==null?'—':`${new Intl.NumberFormat('uk-UA',{maximumFractionDigits:1}).format(value)}%`
}
export function responseLabel(minutes) {
  if(minutes==null)return '—'
  if(minutes<1)return '< 1 хв'
  const rounded=Math.round(minutes)
  if(rounded<60)return `${rounded} хв`
  return `${Math.floor(rounded/60)} год ${rounded%60} хв`
}
