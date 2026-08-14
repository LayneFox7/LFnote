import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Link, Task } from '../types'
import type { BatchUpdate } from '../api'
import { DAYS_SHORT_RU, MONTHS_RU, addDays, mondayOf, toISODate } from '../date'
import { buildArrowPath } from '../arrows'

const ROW_H = 36
const BAR_H = 22

type Scale = 'day' | 'week' | 'month'

const SCALE_META: Record<Scale, { label: string; pxPerDay: number; days: number; step: number }> = {
  day: { label: 'День', pxPerDay: 30, days: 42, step: 21 },
  week: { label: 'Неделя', pxPerDay: 14, days: 84, step: 42 },
  month: { label: 'Месяц', pxPerDay: 4.5, days: 240, step: 120 },
}

const BAR_COLORS = [
  '#4f7cff',
  '#27ae60',
  '#e67e22',
  '#8e44ad',
  '#16a085',
  '#d9534f',
  '#3498db',
  '#e84393',
  '#00b894',
  '#f1c40f',
]

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

const addIso = (iso: string, n: number) => toISODate(addDays(new Date(`${iso}T00:00:00`), n))

const dayDiff = (a: Date, b: Date) =>
  Math.round(
    (Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) /
      86400000,
  )

const hashId = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const isDark = (hex: string) => {
  const m = hex.replace('#', '')
  if (m.length < 6) return false
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b < 150
}

const fmtShortMonth = (d: Date) => MONTHS_RU[d.getMonth()].toLowerCase().slice(0, 3)

interface GanttViewProps {
  tasks: Task[]
  links: Link[]
  onCreateTask: (text: string, start: string, end: string, parentId: string | null, progress: number) => Promise<Task>
  onUpdateTask: (id: string, patch: Partial<Pick<Task, 'text' | 'startDate' | 'endDate' | 'progress' | 'parentId'>>) => void
  onBatchUpdate: (items: BatchUpdate[]) => void
  onDeleteTask: (id: string) => void
  onCreateLink: (from: string, to: string) => void
  onDeleteLink: (id: string) => void
}

type BarDrag =
  | { type: 'move' | 'resize-start' | 'resize-end'; taskId: string; delta: number; isProject: boolean }
  | null

type DepDrag = { fromId: string; mode: 'out' | 'in'; x: number; y: number; hoverId: string | null } | null

interface HeaderSpan {
  left: number
  width: number
  label: string
}

export function GanttView({
  tasks,
  links,
  onCreateTask,
  onUpdateTask,
  onBatchUpdate,
  onDeleteTask,
  onCreateLink,
  onDeleteLink,
}: GanttViewProps) {
  const [scale, setScale] = useState<Scale>('week')
  const [centerIso, setCenterIso] = useState(() => toISODate(new Date()))
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [drag, setDrag] = useState<BarDrag>(null)
  const [depDrag, setDepDrag] = useState<DepDrag>(null)
  const [depMenu, setDepMenu] = useState<{ linkId: string; x: number; y: number } | null>(null)

  const rightRef = useRef<HTMLDivElement>(null)
  const headInnerRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)

  const pxPerDay = SCALE_META[scale].pxPerDay
  const windowDays = SCALE_META[scale].days

  const start = useMemo(() => {
    const center = new Date(`${centerIso}T00:00:00`)
    if (scale === 'week') return mondayOf(addDays(center, -Math.floor(windowDays / 2)))
    if (scale === 'month') {
      const d = addDays(center, -Math.floor(windowDays / 2))
      return new Date(d.getFullYear(), d.getMonth(), 1)
    }
    return addDays(center, -Math.floor(windowDays / 2))
  }, [scale, centerIso, windowDays])

  const dayIndex = useCallback(
    (iso: string) => dayDiff(new Date(`${iso}T00:00:00`), start),
    [start],
  )

  const contentW = windowDays * pxPerDay

  const byParent = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of tasks) {
      const p = t.parentId ?? ''
      const arr = m.get(p) ?? []
      arr.push(t)
      m.set(p, arr)
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order
        const as = a.startDate ?? a.date
        const bs = b.startDate ?? b.date
        if (as !== bs) return as < bs ? -1 : 1
        return (a.createdAt ?? '') < (b.createdAt ?? '') ? -1 : 1
      })
    }
    return m
  }, [tasks])

  const hasChildren = useCallback((t: Task) => (byParent.get(t.id)?.length ?? 0) > 0, [byParent])

  const descendantSet = useMemo(() => {
    const cache = new Map<string, Set<string>>()
    const compute = (id: string): Set<string> => {
      const hit = cache.get(id)
      if (hit) return hit
      const s = new Set<string>()
      for (const k of byParent.get(id) ?? []) {
        s.add(k.id)
        for (const x of compute(k.id)) s.add(x)
      }
      cache.set(id, s)
      return s
    }
    for (const t of tasks) compute(t.id)
    return cache
  }, [tasks, byParent])

  const rows = useMemo(() => {
    const out: { task: Task; depth: number }[] = []
    const visit = (t: Task, depth: number) => {
      out.push({ task: t, depth })
      if (expanded.has(t.id)) for (const k of byParent.get(t.id) ?? []) visit(k, depth + 1)
    }
    for (const t of byParent.get('') ?? []) visit(t, 0)
    return out
  }, [byParent, expanded])

  const rowIndexById = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((r, i) => m.set(r.task.id, i))
    return m
  }, [rows])

  const effRange = useCallback(
    (t: Task): { start: string; end: string } => {
      const s = t.startDate ?? t.date
      let e = t.endDate ?? t.startDate ?? t.date
      if (e < s) e = s
      return { start: s, end: e }
    },
    [],
  )

  const ranges = useMemo(() => {
    const m = new Map<string, { start: string; end: string }>()
    for (const t of tasks) m.set(t.id, effRange(t))
    if (drag?.type === 'move') {
      const t = tasks.find((x) => x.id === drag.taskId)
      if (t) {
        const r = effRange(t)
        m.set(t.id, { start: addIso(r.start, drag.delta), end: addIso(r.end, drag.delta) })
        const set = descendantSet.get(t.id)
        if (set) {
          for (const id of set) {
            const rr = m.get(id)
            if (rr) m.set(id, { start: addIso(rr.start, drag.delta), end: addIso(rr.end, drag.delta) })
          }
        }
      }
    } else if (drag?.type === 'resize-start' || drag?.type === 'resize-end') {
      const t = tasks.find((x) => x.id === drag.taskId)
      if (t) {
        const r = effRange(t)
        if (drag.type === 'resize-start') {
          const s = addIso(r.start, drag.delta) > r.end ? r.end : addIso(r.start, drag.delta)
          m.set(t.id, { start: s, end: r.end })
        } else {
          const e = addIso(r.end, drag.delta) < r.start ? r.start : addIso(r.end, drag.delta)
          m.set(t.id, { start: r.start, end: e })
        }
      }
    }
    return m
  }, [tasks, drag, descendantSet, effRange])

  const summaryRange = useCallback(
    (t: Task): { start: string; end: string } => {
      const kids = byParent.get(t.id)
      if (!kids || kids.length === 0) return ranges.get(t.id) ?? effRange(t)
      let min: string | null = null
      let max: string | null = null
      const walk = (list: Task[]) => {
        for (const k of list) {
          const r = ranges.get(k.id) ?? effRange(k)
          if (!min || r.start < min) min = r.start
          if (!max || r.end > max) max = r.end
          walk(byParent.get(k.id) ?? [])
        }
      }
      walk(kids)
      if (min && max) return { start: min, end: max }
      return ranges.get(t.id) ?? effRange(t)
    },
    [byParent, ranges, effRange],
  )

  const displayRange = useCallback(
    (t: Task) => (hasChildren(t) ? summaryRange(t) : ranges.get(t.id) ?? effRange(t)),
    [hasChildren, summaryRange, ranges, effRange],
  )

  const barGeom = useCallback(
    (rowIdx: number, r: { start: string; end: string }) => {
      const x0 = dayIndex(r.start) * pxPerDay
      const x1 = (dayIndex(r.end) + 1) * pxPerDay
      const y = rowIdx * ROW_H + (ROW_H - BAR_H) / 2
      return { x0, x1, y, w: Math.max(x1 - x0, 4), h: BAR_H }
    },
    [dayIndex, pxPerDay],
  )

  const barGeoms = rows.map((r, i) => {
    const rr = displayRange(r.task)
    return { row: r, i, g: barGeom(i, rr), rr }
  })

  const rectById = useMemo(() => {
    const m = new Map<string, { id: string; x: number; y: number; w: number; h: number }>()
    for (const b of barGeoms) m.set(b.row.task.id, { id: b.row.task.id, x: b.g.x0, y: b.g.y, w: b.g.w, h: b.g.h })
    return m
  }, [barGeoms])

  const header = useMemo(() => {
    const monthSpans: HeaderSpan[] = []
    const unitSpans: HeaderSpan[] = []
    const weekends: { left: number; width: number }[] = []
    const strongLines: number[] = []
    const faintLines: number[] = []
    const px = pxPerDay

    if (scale === 'day' || scale === 'week') {
      let mStart = -1
      let mFirst = start
      let mLabel = ''
      for (let i = 0; i < windowDays; i++) {
        const d = addDays(start, i)
        const wd = d.getDay()
        if (wd === 0 || wd === 6) weekends.push({ left: i * px, width: px })
        if (mStart === -1 || d.getMonth() !== mFirst.getMonth() || d.getFullYear() !== mFirst.getFullYear()) {
          if (mStart !== -1) monthSpans.push({ left: mStart, width: i * px - mStart, label: mLabel })
          mStart = i * px
          mFirst = d
          mLabel = `${MONTHS_RU[d.getMonth()]}${d.getMonth() === 0 ? ` ${d.getFullYear()}` : ''}`
        }
      }
      monthSpans.push({ left: mStart, width: windowDays * px - mStart, label: mLabel })
      if (scale === 'day') {
        for (let i = 0; i < windowDays; i++) {
          const d = addDays(start, i)
          unitSpans.push({ left: i * px, width: px, label: `${DAYS_SHORT_RU[(d.getDay() + 6) % 7]} ${d.getDate()}` })
          faintLines.push(i * px)
        }
      } else {
        for (let i = 0; i < windowDays; i += 7) {
          const d = addDays(start, i)
          const last = addDays(start, Math.min(i + 6, windowDays - 1))
          unitSpans.push({ left: i * px, width: 7 * px, label: `${d.getDate()}–${last.getDate()} ${fmtShortMonth(last)}` })
          strongLines.push(i * px)
          faintLines.push(i * px)
        }
      }
    } else {
      let i = 0
      while (i < windowDays) {
        const d = addDays(start, i)
        const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
        const w = Math.min(dim, windowDays - i)
        const label =
          d.getMonth() === 0 || i === 0 ? `${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}` : MONTHS_RU[d.getMonth()]
        unitSpans.push({ left: i * px, width: w * px, label })
        strongLines.push(i * px)
        for (let wk = 0; wk < w; wk += 7) faintLines.push((i + wk) * px)
        i += w
      }
    }
    return { monthSpans, unitSpans, weekends, strongLines, faintLines }
  }, [scale, start, windowDays, pxPerDay])

  const todayX = dayIndex(toISODate(new Date())) * pxPerDay

  const linkPaths = useMemo(() => {
    const obstacles = barGeoms.map((b) => ({
      id: b.row.task.id,
      x: b.g.x0,
      y: b.g.y,
      w: b.g.w,
      h: b.g.h,
    }))
    return links.flatMap((link) => {
      const a = rectById.get(link.from)
      const b = rectById.get(link.to)
      if (!a || !b) return []
      const p1 = { x: a.x + a.w, y: a.y + a.h / 2 }
      const p2 = { x: b.x, y: b.y + b.h / 2 }
      const obs = obstacles.filter((o) => o.id !== link.from && o.id !== link.to)
      const style = link.style ?? {}
      const d = buildArrowPath(p1, p2, { ...style, type: style.type ?? 'straight' }, obs)
      return [{ link, d }]
    })
  }, [links, rectById, barGeoms])

  useEffect(() => {
    const r = rightRef.current
    if (!r) return
    const onScroll = () => {
      if (rowsRef.current) rowsRef.current.style.transform = `translateY(${-r.scrollTop}px)`
      if (headInnerRef.current) headInnerRef.current.style.transform = `translateX(${-r.scrollLeft}px)`
    }
    r.addEventListener('scroll', onScroll)
    onScroll()
    return () => r.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const r = rightRef.current
    if (!r) return
    const x = dayIndex(centerIso) * pxPerDay
    r.scrollLeft = Math.max(0, x - r.clientWidth * 0.35)
    r.scrollTop = 0
  }, [scale, centerIso, dayIndex, pxPerDay])

  useEffect(() => {
    const id = creatingId ?? editingId
    if (!id) return
    const idx = rowIndexById.get(id)
    if (idx === undefined || !rightRef.current) return
    const target = idx * ROW_H - 60
    rightRef.current.scrollTop = Math.max(0, target)
  }, [creatingId, editingId, rowIndexById])

  useEffect(() => {
    if (!depMenu) return
    const close = () => setDepMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [depMenu])

  const commitEdit = useCallback(
    (t: Task) => {
      const v = draft.trim()
      if (v) {
        if (v !== t.text) onUpdateTask(t.id, { text: v })
      } else if (creatingId === t.id) {
        onDeleteTask(t.id)
      }
      setCreatingId(null)
      setEditingId(null)
    },
    [draft, creatingId, onUpdateTask, onDeleteTask],
  )

  const cancelEdit = useCallback(
    (t: Task) => {
      if (creatingId === t.id) onDeleteTask(t.id)
      setCreatingId(null)
      setEditingId(null)
    },
    [creatingId, onDeleteTask],
  )

  const addTask = useCallback(
    async (parentId: string | null, isProject: boolean) => {
      const startIso = toISODate(new Date())
      const endIso = toISODate(addDays(new Date(), isProject ? 13 : 6))
      let id: string | null = null
      const task = await onCreateTask(isProject ? 'Новый проект' : 'Новая задача', startIso, endIso, parentId, 0)
      id = task.id
      if (parentId) setExpanded((prev) => new Set([...prev, parentId]))
      setCreatingId(id)
      setEditingId(id)
      setDraft('')
    },
    [onCreateTask],
  )

  const toggleExpandAll = useCallback(
    (expand: boolean) => {
      const ids = tasks.filter((t) => hasChildren(t)).map((t) => t.id)
      setExpanded(expand ? new Set(ids) : new Set())
    },
    [tasks, hasChildren],
  )

  const stepProgress = useCallback(
    (t: Task, d: number) => {
      onUpdateTask(t.id, { progress: clamp((t.progress ?? 0) + d, 0, 100) })
    },
    [onUpdateTask],
  )

  const changeStart = useCallback(
    (t: Task, v: string) => {
      if (!v) return
      const end = t.endDate ?? t.startDate ?? t.date
      if (v > end) onUpdateTask(t.id, { startDate: v, endDate: v })
      else onUpdateTask(t.id, { startDate: v })
    },
    [onUpdateTask],
  )

  const changeEnd = useCallback(
    (t: Task, v: string) => {
      if (!v) return
      const startD = t.startDate ?? t.date
      if (v < startD) onUpdateTask(t.id, { endDate: v, startDate: v })
      else onUpdateTask(t.id, { endDate: v })
    },
    [onUpdateTask],
  )

  const beginDrag = useCallback(
    (e: React.PointerEvent, t: Task, type: 'move' | 'resize-start' | 'resize-end') => {
      e.preventDefault()
      e.stopPropagation()
      if (e.button !== 0) return
      const startX = e.clientX
      const isProject = hasChildren(t)
      document.body.classList.add('gantt-dragging')
      const deltaOf = (cx: number) => Math.round((cx - startX) / pxPerDay)
      const onMove = (ev: PointerEvent) => setDrag({ type, taskId: t.id, delta: deltaOf(ev.clientX), isProject })
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        document.body.classList.remove('gantt-dragging')
        const delta = deltaOf(ev.clientX)
        setDrag(null)
        if (delta === 0) return
        const r = effRange(t)
        if (type === 'move') {
          if (isProject) {
            const items: BatchUpdate[] = [{ id: t.id, startDate: addIso(r.start, delta), endDate: addIso(r.end, delta) }]
            for (const id of descendantSet.get(t.id) ?? []) {
              const tr = tasks.find((x) => x.id === id)
              if (!tr) continue
              const rr = effRange(tr)
              items.push({ id, startDate: addIso(rr.start, delta), endDate: addIso(rr.end, delta) })
            }
            onBatchUpdate(items)
          } else {
            onUpdateTask(t.id, { startDate: addIso(r.start, delta), endDate: addIso(r.end, delta) })
          }
        } else if (type === 'resize-start') {
          const s = addIso(r.start, delta) > r.end ? r.end : addIso(r.start, delta)
          onUpdateTask(t.id, { startDate: s })
        } else {
          const e2 = addIso(r.end, delta) < r.start ? r.start : addIso(r.end, delta)
          onUpdateTask(t.id, { endDate: e2 })
        }
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      setDrag({ type, taskId: t.id, delta: 0, isProject })
    },
    [pxPerDay, hasChildren, effRange, descendantSet, tasks, onBatchUpdate, onUpdateTask],
  )

  const beginDepDrag = useCallback(
    (e: React.PointerEvent, t: Task, mode: 'out' | 'in') => {
      e.preventDefault()
      e.stopPropagation()
      if (e.button !== 0) return
      const contentPoint = (cx: number, cy: number) => {
        const r = rightRef.current
        if (!r) return { x: cx, y: cy }
        const br = r.getBoundingClientRect()
        return { x: cx - br.left + r.scrollLeft, y: cy - br.top + r.scrollTop }
      }
      const setPos = (cx: number, cy: number) => {
        const target = document
          .elementFromPoint(cx, cy)
          ?.closest?.('.gantt-bar') as HTMLElement | null
        const p = contentPoint(cx, cy)
        setDepDrag({ fromId: t.id, mode, x: p.x, y: p.y, hoverId: target?.dataset.id ?? null })
      }
      const onMove = (ev: PointerEvent) => setPos(ev.clientX, ev.clientY)
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        const target = document
          .elementFromPoint(ev.clientX, ev.clientY)
          ?.closest?.('.gantt-bar') as HTMLElement | null
        setDepDrag(null)
        const toId = target?.dataset.id ?? null
        if (!toId || toId === t.id) return
        if (mode === 'out') onCreateLink(t.id, toId)
        else onCreateLink(toId, t.id)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      setDepDrag({ fromId: t.id, mode, x: e.clientX, y: e.clientY, hoverId: null })
    },
    [onCreateLink],
  )

  const onBarPointerDown = useCallback(
    (e: React.PointerEvent, t: Task) => {
      const el = e.target as HTMLElement
      if (el.closest('.gantt-conn-in')) return beginDepDrag(e, t, 'in')
      if (el.closest('.gantt-conn-out')) return beginDepDrag(e, t, 'out')
      if (el.closest('.gantt-resize-l')) return beginDrag(e, t, 'resize-start')
      if (el.closest('.gantt-resize-r')) return beginDrag(e, t, 'resize-end')
      return beginDrag(e, t, 'move')
    },
    [beginDrag, beginDepDrag],
  )

  const barColor = (t: Task, isProject: boolean) => {
    if (t.style?.bg) return t.style.bg
    if (isProject) return '#3b4754'
    return BAR_COLORS[hashId(t.id) % BAR_COLORS.length]
  }

  const draggingBar = barGeoms.find((b) => b.row.task.id === drag?.taskId)
  const tooltip =
    drag && draggingBar
      ? { left: draggingBar.g.x0, top: draggingBar.g.y - 34, text: `${draggingBar.rr.start} — ${draggingBar.rr.end}` }
      : null

  const depGhost = useMemo(() => {
    if (!depDrag) return null
    const bar = rectById.get(depDrag.fromId)
    if (!bar) return null
    const from = depDrag.mode === 'out' ? { x: bar.x + bar.w, y: bar.y + bar.h / 2 } : { x: bar.x, y: bar.y + bar.h / 2 }
    return { from, to: { x: depDrag.x, y: depDrag.y } }
  }, [depDrag, rectById])

  const rowsH = rows.length * ROW_H
  const faintW = scale === 'month' ? 7 * pxPerDay : pxPerDay
  const bodyBg = {
    backgroundImage: `linear-gradient(to right, transparent ${faintW - 1}px, rgba(0,0,0,0.045) ${faintW - 1}px, rgba(0,0,0,0.045) ${faintW}px), linear-gradient(to bottom, transparent ${ROW_H - 1}px, var(--border) ${ROW_H - 1}px, var(--border) ${ROW_H}px)`,
    backgroundSize: `100% 100%, 100% ${ROW_H}px`,
  }
  const rangeLabel = useMemo(() => {
    const c = new Date(`${centerIso}T12:00:00`)
    if (scale === 'day') {
      return `${c.getDate()} ${MONTHS_RU[c.getMonth()].toLowerCase()} ${c.getFullYear()}`
    }
    if (scale === 'week') {
      const first = mondayOf(c)
      const last = addDays(first, 6)
      const fmt = (d: Date) => `${d.getDate()} ${MONTHS_RU[d.getMonth()].toLowerCase()}`
      return `${fmt(first)} — ${fmt(last)} ${c.getFullYear()}`
    }
    return `${MONTHS_RU[c.getMonth()]} ${c.getFullYear()}`
  }, [scale, centerIso])

  const nav = (dir: 1 | -1) => {
    setCenterIso((prev) => toISODate(addDays(new Date(`${prev}T00:00:00`), SCALE_META[scale].step * dir)))
  }

  const empty = rows.length === 0

  return (
    <div className="gantt">
      <div className="gantt-toolbar">
        <button className="nav-btn" onClick={() => nav(-1)} aria-label="Назад">
          ‹
        </button>
        <button className="gantt-range" onClick={() => setCenterIso(toISODate(new Date()))} title="К сегодняшнему дню">
          {rangeLabel}
        </button>
        <button className="nav-btn" onClick={() => nav(1)} aria-label="Вперёд">
          ›
        </button>
        <button className="today-btn" onClick={() => setCenterIso(toISODate(new Date()))}>
          Сегодня
        </button>
        <div className="gantt-scales">
          {(Object.keys(SCALE_META) as Scale[]).map((s) => (
            <button key={s} className={`gantt-scale${scale === s ? ' on' : ''}`} onClick={() => setScale(s)}>
              {SCALE_META[s].label}
            </button>
          ))}
        </div>
        <div className="gantt-adds">
          <button className="gantt-add" onClick={() => void addTask(null, false)}>
            + Задача
          </button>
          <button className="gantt-add" onClick={() => void addTask(null, true)}>
            + Проект
          </button>
        </div>
        <button className="gantt-text-btn" onClick={() => toggleExpandAll(true)} title="Развернуть все">
          ▸▾
        </button>
        <button className="gantt-text-btn" onClick={() => toggleExpandAll(false)} title="Свернуть все">
          ▸▴
        </button>
      </div>
      {empty ? (
        <div className="gantt-empty">
          Пока нет задач. Нажмите «+ Задача» или «+ Проект», чтобы начать планирование.
        </div>
      ) : (
        <div className="gantt-scroll">
          <div className="gantt-head">
            <div className="gantt-left-head">
              <div className="gantt-hcol">Задача</div>
              <div className="gantt-hcol">Начало</div>
              <div className="gantt-hcol">Конец</div>
              <div className="gantt-hcol">Прогресс</div>
              <div className="gantt-hcol gantt-hcol-actions" />
            </div>
            <div className="gantt-right-head">
              <div className="gantt-head-inner" ref={headInnerRef} style={{ width: contentW }}>
                <div className="gantt-month-row">
                  {header.monthSpans.map((s, i) => (
                    <div key={i} className="gantt-month-cell" style={{ left: s.left, width: s.width }}>
                      {s.label}
                    </div>
                  ))}
                </div>
                <div className="gantt-unit-row">
                  {header.unitSpans.map((s, i) => (
                    <div key={i} className="gantt-unit-cell" style={{ left: s.left, width: s.width }}>
                      {s.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="gantt-bodywrap">
            <div className="gantt-left-body">
              <div className="gantt-rows" ref={rowsRef} style={{ height: rowsH }}>
                {barGeoms.map(({ row }) => {
                  const t = row.task
                  const isProj = hasChildren(t)
                  const editing = editingId === t.id
                  return (
                    <div
                      key={t.id}
                      className={`gantt-row${isProj ? ' project' : ''}${editing ? ' editing' : ''}`}
                      style={{ top: rowIndexById.get(t.id)! * ROW_H }}
                    >
                      <div className="gantt-cell gantt-cell-name" style={{ paddingLeft: 6 + row.depth * 18 }}>
                        {isProj && (
                          <button
                            className={`gantt-toggle${expanded.has(t.id) ? ' on' : ''}`}
                            onClick={() =>
                              setExpanded((prev) => {
                                const next = new Set(prev)
                                if (next.has(t.id)) next.delete(t.id)
                                else next.add(t.id)
                                return next
                              })
                            }
                            aria-label="Свернуть/развернуть"
                          >
                            ▸
                          </button>
                        )}
                        {editing ? (
                          <input
                            className="gantt-name-input"
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit(t)
                              else if (e.key === 'Escape') cancelEdit(t)
                            }}
                            onBlur={() => commitEdit(t)}
                          />
                        ) : (
                          <span className="gantt-name" onDoubleClick={() => { setDraft(t.text); setEditingId(t.id) }}>
                            {t.text}
                          </span>
                        )}
                      </div>
                      <div className="gantt-cell">
                        <input
                          type="date"
                          className="gantt-date-input"
                          value={t.startDate ?? t.date}
                          onChange={(e) => changeStart(t, e.target.value)}
                        />
                      </div>
                      <div className="gantt-cell">
                        <input
                          type="date"
                          className="gantt-date-input"
                          value={t.endDate ?? t.startDate ?? t.date}
                          onChange={(e) => changeEnd(t, e.target.value)}
                        />
                      </div>
                      <div className="gantt-cell gantt-cell-progress">
                        <button className="gantt-step" onClick={() => stepProgress(t, -10)} aria-label="−10%">
                          −
                        </button>
                        <span className="gantt-progress-val">{t.progress ?? 0}%</span>
                        <button className="gantt-step" onClick={() => stepProgress(t, 10)} aria-label="+10%">
                          +
                        </button>
                      </div>
                      <div className="gantt-cell gantt-cell-actions">
                        <button className="gantt-row-btn" onClick={() => void addTask(t.id, false)} title="Добавить подзадачу">
                          +
                        </button>
                        <button
                          className="gantt-row-btn danger"
                          onClick={() => onDeleteTask(t.id)}
                          title="Удалить задачу и подзадачи"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="gantt-right-body" ref={rightRef}>
              <div className="gantt-body" style={{ width: contentW, height: rowsH, ...bodyBg }}>
                {header.weekends.map((w, i) => (
                  <div key={i} className="gantt-weekend" style={{ left: w.left, width: w.width, height: rowsH }} />
                ))}
                {header.faintLines.map((x, i) => (
                  <div key={`f${i}`} className="gantt-line faint" style={{ left: x, height: rowsH }} />
                ))}
                {header.strongLines.map((x, i) => (
                  <div key={`s${i}`} className="gantt-line strong" style={{ left: x, height: rowsH }} />
                ))}
                <div className="gantt-today-line" style={{ left: todayX, height: rowsH }}>
                  <div className="gantt-today-label">Сегодня</div>
                </div>
                {barGeoms.map(({ row, g, rr }) => {
                  const t = row.task
                  const isProj = hasChildren(t)
                  const bg = barColor(t, isProj)
                  const fg = isDark(bg) ? '#ffffff' : '#1f1e1a'
                  const done = t.done
                  const p = clamp(t.progress ?? 0, 0, 100)
                  return (
                    <div
                      key={t.id}
                      className={`gantt-bar${isProj ? ' project' : ''}${done ? ' done' : ''}${
                        drag?.taskId === t.id ? ' dragging' : ''
                      }${depDrag?.hoverId === t.id ? ' dep-target' : ''}`}
                      data-id={t.id}
                      style={{ left: g.x0, top: g.y, width: g.w, height: g.h, background: bg, color: fg }}
                      onPointerDown={(e) => onBarPointerDown(e, t)}
                      title={`${t.text} — ${rr.start} … ${rr.end}`}
                    >
                      <div className="gantt-bar-progress" style={{ width: `${p}%` }} />
                      {!isProj && (
                        <>
                          <span className="gantt-conn gantt-conn-in" title="Создать связь → в эту задачу" />
                          <span className="gantt-conn gantt-conn-out" title="Создать связь ← из этой задачи" />
                        </>
                      )}
                      {!isProj && <span className="gantt-resize gantt-resize-l" />}
                      {!isProj && <span className="gantt-resize gantt-resize-r" />}
                      {g.w > 60 && <span className="gantt-bar-label">{t.text}</span>}
                    </div>
                  )
                })}
                <svg className="gantt-links" width={contentW} height={rowsH}>
                  <defs>
                    <marker
                      id="gantt-ah"
                      viewBox="0 0 12 12"
                      refX="10"
                      refY="6"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto"
                    >
                      <path d="M2,2 L11,6 L2,10 z" fill="#9aa0a6" />
                    </marker>
                  </defs>
                  {linkPaths.map(({ link, d }) => (
                    <path
                      key={link.id}
                      className="gantt-link"
                      d={d}
                      markerEnd="url(#gantt-ah)"
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDepMenu({ linkId: link.id, x: e.clientX, y: e.clientY })
                      }}
                    />
                  ))}
                  {depGhost && (
                    <path className="gantt-link ghost" d={buildArrowPath(depGhost.from, depGhost.to, { type: 'straight' }, [])} />
                  )}
                </svg>
                {tooltip && (
                  <div className="gantt-tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
                    {tooltip.text}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {depMenu && (
        <div className="arrow-menu gantt-dep-menu" style={{ left: depMenu.x, top: depMenu.y }} onMouseDown={(e) => e.stopPropagation()}>
          <div className="menu-label">Связь задач</div>
          <button
            className="arrow-menu-btn danger"
            onClick={() => {
              onDeleteLink(depMenu.linkId)
              setDepMenu(null)
            }}
          >
            Удалить связь
          </button>
        </div>
      )}
    </div>
  )
}
