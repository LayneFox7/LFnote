import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatWeekLabel } from '../date'
import type { FilterType, View } from '../types'
import { CalendarPopup } from './CalendarPopup'

interface WeekStripProps {
  days: Date[]
  centerDate: Date
  toolbar?: ReactNode
  userLogin?: string | null
  onLogout?: () => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onPickDate: (iso: string) => void
  view?: View
  onViewChange?: (view: View) => void
  numDays?: number
  onNumDays?: (n: number) => void
  filterType?: FilterType
  onFilterType?: (f: FilterType) => void
}

export function WeekStrip({
  days,
  centerDate,
  toolbar,
  userLogin,
  onLogout,
  onPrev,
  onNext,
  onToday,
  onPickDate,
  view = 'week',
  onViewChange,
  numDays = 7,
  onNumDays,
  filterType = 'all',
  onFilterType,
}: WeekStripProps) {
  const [calOpen, setCalOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!calOpen) return
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setCalOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [calOpen])

  const showNav = view === 'week' || view === 'rows'
  const showDays = view === 'week' || view === 'rows'

  return (
    <header className="topbar">
      <button className="nav-btn" onClick={onPrev} aria-label="Предыдущий период" disabled={!showNav}>
        ‹
      </button>
      <div className="week-label-wrap" ref={wrapRef}>
        <button className="month-btn" onClick={() => showNav && setCalOpen((o) => !o)} title="Открыть календарь" disabled={!showNav}>
          {formatWeekLabel(days)}
        </button>
        {calOpen && (
          <CalendarPopup
            center={centerDate}
            onPick={(iso) => {
              setCalOpen(false)
              onPickDate(iso)
            }}
          />
        )}
      </div>
      <button className="nav-btn" onClick={onNext} aria-label="Следующий период" disabled={!showNav}>
        ›
      </button>
      <div className="numdays-toggle" role="group" aria-label="Сколько дней">
        {[3, 5, 7].map((n) => (
          <button key={n} className={numDays === n ? 'on' : ''} onClick={() => showDays && onNumDays?.(n)} title={`Показывать ${n} дней`} disabled={!showDays}>
            {n}
          </button>
        ))}
      </div>
      {onViewChange && (
        <div className="view-toggle" role="tablist" aria-label="Вид">
          <button role="tab" className={view === 'week' ? 'on' : ''} onClick={() => onViewChange('week')}>
            Неделя
          </button>
          <button role="tab" className={view === 'rows' ? 'on' : ''} onClick={() => onViewChange('rows')}>
            Горизонт
          </button>
          <button role="tab" className={view === 'list' ? 'on' : ''} onClick={() => onViewChange('list')}>
            Список
          </button>
          <button role="tab" className={view === 'gantt' ? 'on' : ''} onClick={() => onViewChange('gantt')}>
            Гант
          </button>
        </div>
      )}
      {onFilterType && (
        <div className="filter-toggle" role="tablist" aria-label="Тип">
          <button role="tab" className={filterType === 'all' ? 'on' : ''} onClick={() => onFilterType('all')} disabled={view === 'gantt'}>Все</button>
          <button role="tab" className={filterType === 'tasks' ? 'on' : ''} onClick={() => onFilterType('tasks')} disabled={view === 'gantt'}>Задачи</button>
          <button role="tab" className={filterType === 'notes' ? 'on' : ''} onClick={() => onFilterType('notes')} disabled={view === 'gantt'}>Заметки</button>
        </div>
      )}
      {toolbar}
      <button className="today-btn" onClick={onToday} disabled={!showNav}>
        Сегодня
      </button>
      {userLogin && (
        <div className="user-chip" title="Аккаунт">
          <span className="user-login">{userLogin}</span>
          {onLogout && (
            <button className="logout-btn" onClick={onLogout} title="Выйти и сменить аккаунт">
              Выйти
            </button>
          )}
        </div>
      )}
    </header>
  )
}
