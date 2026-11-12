import { useEffect, useRef, useState } from 'react'
import { emptyFilters, filterKey } from './catalogFilters.js'

export default function FilterSheet({ value, categories, renderCategoryIcon, districts, cuisines, resultCount, unavailable, onApply, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...value, districts: [...value.districts], cuisines: [...value.cuisines] }))
  const [districtQuery, setDistrictQuery] = useState('')
  const dialog = useRef(null)
  useEffect(() => {
    const node = dialog.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    node.showModal()
    return () => { node.close(); document.body.style.overflow = overflow }
  }, [])
  function toggle(field, key) {
    setDraft((old) => ({ ...old, [field]: old[field].includes(key) ? old[field].filter((v) => v !== key) : [...old[field], key] }))
  }
  const count = resultCount(draft)
  const visibleDistricts = districts.filter(([, label]) => filterKey(label).includes(filterKey(districtQuery)))
  return <dialog ref={dialog} className="filter-sheet" aria-labelledby="filter-sheet-title"
    onCancel={(event) => { event.preventDefault(); onClose() }}
    onClick={(event) => {
      if (event.target !== dialog.current) return
      const rect = dialog.current.getBoundingClientRect()
      if (event.clientY < rect.top || event.clientX < rect.left || event.clientX > rect.right) onClose()
    }}>
    <header className="filter-sheet-header"><div><h2 id="filter-sheet-title">Фільтри</h2><p>Знайдіть місце під свій настрій</p></div><button type="button" className="sheet-close" aria-label="Закрити без застосування" onClick={onClose}>✕</button></header>
    <div className="filter-sheet-content">
      <fieldset><legend>Тип закладу</legend><p className="sheet-help">Оберіть один тип або всі заклади</p>
        <div className="sheet-options sheet-categories">{categories.map((category) => <button type="button" key={category} aria-pressed={draft.category === category} className={draft.category === category ? 'chosen' : ''} onClick={() => setDraft((old) => ({ ...old, category }))}>{renderCategoryIcon(category)}{category}</button>)}</div>
      </fieldset>
      <fieldset><legend>Район / місцевість</legend><p className="sheet-help">Можна вибрати кілька</p>
        <input className="search" type="search" aria-label="Пошук району" placeholder="Знайти район…" value={districtQuery} onChange={(e) => setDistrictQuery(e.target.value)} />
        <div className="sheet-options">{visibleDistricts.map(([key, label]) => <button type="button" key={key} aria-pressed={draft.districts.includes(key)} className={draft.districts.includes(key) ? 'chosen' : ''} onClick={() => toggle('districts', key)}>{label}</button>)}</div>
        {!visibleDistricts.length && <p className="sheet-help">{districts.length ? 'Не знайдено. Спробуйте іншу назву.' : 'Райони ще не вказані.'}</p>}
      </fieldset>
      <fieldset><legend>Кухня</legend><p className="sheet-help">Можна вибрати кілька</p><div className="sheet-options">{cuisines.map(([key, label]) => <button type="button" key={key} aria-pressed={draft.cuisines.includes(key)} className={draft.cuisines.includes(key) ? 'chosen' : ''} onClick={() => toggle('cuisines', key)}>{label}</button>)}</div>{!cuisines.length && <p className="sheet-help">Кухні ще не вказані.</p>}</fieldset>
      <fieldset><legend>Особливості</legend><label className="sheet-check"><span>Можна з тваринами</span><input type="checkbox" checked={draft.petFriendly} onChange={(e) => setDraft((old) => ({ ...old, petFriendly: e.target.checked }))} /></label></fieldset>
      <fieldset><legend>Графік</legend><label className="sheet-check"><span>Відкрито зараз</span><input type="checkbox" checked={draft.onlyOpen} onChange={(e) => setDraft((old) => ({ ...old, onlyOpen: e.target.checked }))} /></label></fieldset>
      <p className="sheet-help" role="status" aria-live="polite">{unavailable ? 'Зачекайте завантаження каталогу.' : count === 0 ? 'За цими умовами немає закладів. Приберіть один із фільтрів.' : `Знайдено закладів: ${count}`}</p>
    </div>
    <footer className="filter-sheet-footer"><button type="button" className="menu-btn" onClick={() => { setDraft(emptyFilters()); setDistrictQuery('') }}>Скинути</button><button type="button" className="book" disabled={unavailable} onClick={() => onApply(draft)}>{unavailable ? 'Завантаження…' : `Показати заклади · ${count}`}</button></footer>
  </dialog>
}
