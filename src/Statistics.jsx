import { useEffect,useState } from 'react'
import {dateShift,conversionPercent,percentLabel,responseLabel} from './statsHelpers.js'

export default function Statistics({onBack,onExit}) {
  const [today]=useState(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv'}).format(new Date()))
  const [preset,setPreset]=useState('7')
  const [start,setStart]=useState(()=>dateShift(today,-6))
  const [end,setEnd]=useState(today)
  const [period,setPeriod]=useState(()=>({start:dateShift(today,-6),end:today}))
  const [includeTest,setIncludeTest]=useState(false)
  const [reload,setReload]=useState(0)
  const [report,setReport]=useState(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  useEffect(()=>{
    const controller=new AbortController()
    async function load() {
      setLoading(true);setError('')
      try{
        const response=await fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
          body:JSON.stringify({action:'report',initData:window.Telegram?.WebApp?.initData || '',start:period.start,end:period.end,includeTest})})
        const data=await response.json()
        if(!response.ok)throw Error(data.message || 'Відкрийте застосунок заново через Telegram.')
        if(!controller.signal.aborted)setReport(data)
      }catch(e){if(!controller.signal.aborted)setError(e.message)}finally{if(!controller.signal.aborted)setLoading(false)}
    }
    const timer=setTimeout(load,0)
    return()=>{clearTimeout(timer);controller.abort()}
  },[period,includeTest,reload])
  function choose(value) {
    setPreset(value)
    if(value==='custom')return
    const first=dateShift(today,value==='today'?0:1-Number(value))
    setStart(first);setEnd(today);setPeriod({start:first,end:today})
  }
  const m=report?.summary
  return <div className="app statistics">
    <div className="editor-navigation"><button className="back" onClick={onBack}>← Бронювання</button><button className="back" onClick={onExit}>До каталогу</button></div>
    <div className="topbar"><h1>Статистика</h1><button className="cab-btn" disabled={loading} onClick={()=>setReload((n)=>n+1)}>Оновити</button></div>
    <div className="stats-periods" role="group" aria-label="Період статистики">{[['today','Сьогодні'],['7','7 днів'],['30','30 днів'],['custom','Свій період']].map(([key,label])=><button key={key} className={preset===key?'active':''} aria-pressed={preset===key} onClick={()=>choose(key)}>{label}</button>)}</div>
    {preset==='custom' && <form className="stats-date-form" onSubmit={(e)=>{e.preventDefault();if(start>end){setError('Початок періоду має бути не пізніше кінця.');return}setPeriod({start,end})}}><label>Від<input type="date" required value={start} max={end} onChange={(e)=>setStart(e.target.value)} /></label><label>До<input type="date" required value={end} min={start} max={today} onChange={(e)=>setEnd(e.target.value)} /></label><button className="menu-btn">Показати</button></form>}
    <label className="sheet-check stats-test-toggle"><span>Включити тестові дії адміністраторів</span><input type="checkbox" checked={includeTest} onChange={(e)=>setIncludeTest(e.target.checked)} /></label>
    {loading && <p role="status">Рахуємо статистику…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && m && <>
      <p className="booking-note">Період: {period.start.split('-').reverse().join('.')} — {period.end.split('-').reverse().join('.')} · Київ</p>
      <p className="booking-note stats-help">Збір почався {new Date(report.started_at).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv'})}. Раніші події не враховуються. Дані без імен і телефонів гостей.</p>
      <div className="stats-cards">
        <article><span>{report.owner?'Унікальні відвідувачі апки':'Відвідувачі ваших закладів в апці'}</span><strong>{m.visitors}</strong><small>{report.owner?'Окремі Telegram-користувачі':'Перегляд закладу або відкриття форми'}</small></article>
        <article><span>{report.owner?'Відкриття / сеанси':'Відвідування закладів'}</span><strong>{m.sessions}</strong><small>Повторний запуск або новий сеанс після 30 хв без активності</small></article>
        <article><span>Заявки на бронювання</span><strong>{m.requests}</strong><small>Гостей із заявкою: {m.bookers}</small></article>
        <article><span>Конверсія у заявку</span><strong>{percentLabel(conversionPercent(m))}</strong><small>{m.converted_visitors} із {m.visitors} відвідувачів створили заявку за період</small></article>
        <article><span>Частка підтверджених</span><strong>{percentLabel(m.confirmation_pct)}</strong><small>{m.confirmed} із {m.requests} заявок</small></article>
        <article><span>Типовий час відповіді</span><strong>{responseLabel(m.median_response_minutes)}</strong><small>Медіана · відповідей: {m.responded}</small></article>
      </div>
      <section className="stats-section"><h2>Що сталося із заявками</h2><dl className="stats-breakdown"><div><dt>Підтверджено закладом</dt><dd>{m.confirmed}</dd></div><div><dt>Відхилено</dt><dd>{m.rejected}</dd></div><div><dt>Ще очікують</dt><dd>{m.pending}</dd></div><div><dt>Скасовано до відповіді</dt><dd>{m.cancelled_before}</dd></div></dl><p className="booking-note">Скасовано після відповіді: {m.cancelled_after}. Ці заявки також залишаються в показнику першого рішення закладу.</p></section>
      <section className="stats-section"><h2>Швидкість відповіді</h2><dl className="stats-breakdown"><div><dt>Відповіді до 15 хв</dt><dd>{percentLabel(m.fast_response_pct)}</dd></div><div><dt>Без відповіді понад 15 хв</dt><dd>{m.overdue}</dd></div></dl><p className="booking-note">Час рахується до першого підтвердження або відхилення. Заявки без відповіді показані окремо й не знижують час до нуля.</p></section>
      <section className="stats-section"><h2>Шлях до бронювання</h2><dl className="stats-breakdown"><div><dt>Відвідали {report.owner?'апку':'ваші заклади'}</dt><dd>{m.visitors}</dd></div><div><dt>Переглянули картку закладу</dt><dd>{m.place_viewers}</dd></div><div><dt>Відкрили форму</dt><dd>{m.form_openers}</dd></div><div><dt>Створили заявку</dt><dd>{m.bookers}</dd></div></dl><p className="booking-note">На кроках — унікальні люди. Форму можна відкрити одразу з каталогу, без детальної сторінки.</p></section>
      <section className="stats-section"><h2>По закладах</h2><div className="stats-table-scroll"><table><thead><tr><th>Заклад</th><th>Відвідувачі</th><th>Заявки</th><th>Підтверджено</th><th>Час відповіді</th></tr></thead><tbody>{report.places.map((p)=><tr key={p.id}><th scope="row">{p.name}</th><td>{p.metrics.visitors}</td><td>{p.metrics.requests}</td><td>{percentLabel(p.metrics.confirmation_pct)}</td><td>{responseLabel(p.metrics.median_response_minutes)}</td></tr>)}</tbody></table></div></section>
      <p className="booking-note stats-help">Заявки згруповані за датою створення. Підтвердження зберігається в статистиці навіть після скасування. Дії адміністраторів за замовчуванням виключені. Блокування збору подій або відсутність інтернету можуть зменшувати кількість зафіксованих відвідувань.</p>
    </>}
  </div>
}
