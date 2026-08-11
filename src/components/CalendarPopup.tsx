import { useState } from 'react'
import { DAYS_SHORT_RU, MONTHS_RU, toISODate } from '../date'

interface CalendarPopupProps {
  center: Date
  onPick: (iso: string) => void
}

export function CalendarPopup({ center, onPick }: CalendarPopupProps) {
  const [view, setView] = useState(() => new Date(center.getFullYear(), center.getMonth(), 1))
  const todayIso = toISODate(new Date())
  const centerIso = toISODate(center)

  const year = view.getFullYear()
  const month = view.getMonth()
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (Date | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="cal-pop" onMouseDown={(e) => e.stopPropagation()}>
      <div className="cal-head">
        <button className="nav-btn" onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))} aria-label="Предыдущий месяц">
          ‹
        </button>
        <div className="cal-title">
          {MONTHS_RU[month]} {year}
        </div>
        <button className="nav-btn" onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))} aria-label="Следующий месяц">
          ›
        </button>
      </div>
      <div className="cal-grid">
        {DAYS_SHORT_RU.map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`x${i}`} className="cal-cell empty" />
          const iso = toISODate(d)
          const cls = `cal-cell${iso === todayIso ? ' today' : ''}${iso === centerIso ? ' selected' : ''}`
          return (
            <button key={iso} className={cls} onClick={() => onPick(iso)}>
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
