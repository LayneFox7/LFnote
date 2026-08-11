import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatWeekLabel } from '../date'
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

  return (
    <header className="topbar">
      <button className="nav-btn" onClick={onPrev} aria-label="Предыдущая неделя">
        ‹
      </button>
      <div className="week-label-wrap" ref={wrapRef}>
        <button className="month-btn" onClick={() => setCalOpen((o) => !o)} title="Открыть календарь">
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
      <button className="nav-btn" onClick={onNext} aria-label="Следующая неделя">
        ›
      </button>
      {toolbar}
      <button className="today-btn" onClick={onToday}>
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
