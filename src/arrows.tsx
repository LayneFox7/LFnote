import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type { ArrowStyle, ArrowType, Link } from './types'

export const ARROW_COLOR = '#4f7cff'
export const ARROW_COLORS = ['#4f7cff', '#33332f', '#d9534f', '#e67e22', '#f1c40f', '#27ae60', '#8e44ad', '#3498db', '#7f8c8d']

const TYPE_LABEL: Record<ArrowType, string> = {
  straight: 'Прямая',
  elbow: 'Углы',
  rounded: 'Скругл.',
  routed: 'Огибающая',
  sketch: 'Скетч',
}

type Drag =
  | { kind: 'new'; from: string; side: 'left' | 'right' }
  | { kind: 'move'; linkId: string; end: 'from' | 'to' }

interface Rect {
  id: string
  x: number
  y: number
  w: number
  h: number
}

type Pt = { x: number; y: number }

interface ArrowsContextValue {
  links: Link[]
  weekNode: HTMLDivElement | null
  getRect: (id: string) => { x: number; y: number; w: number; h: number } | null
  getAllRects: () => Rect[]
  registerEl: (id: string, el: HTMLElement | null) => void
  startConnection: (from: string, side: 'left' | 'right', e: React.MouseEvent) => void
  onArrowDown: (link: Link, e: React.PointerEvent<SVGPathElement>) => void
  drag: Drag | null
  cursor: { x: number; y: number } | null
  menu: { linkId: string; x: number; y: number } | null
  openMenu: (linkId: string, x: number, y: number) => void
  closeMenu: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<Pick<Link, 'from' | 'to' | 'style'>>) => void
}

const ArrowsContext = createContext<ArrowsContextValue | null>(null)

export function useArrows() {
  const ctx = useContext(ArrowsContext)
  if (!ctx) throw new Error('useArrows must be used within ArrowsProvider')
  return ctx
}

interface ArrowsProviderProps {
  weekNode: HTMLDivElement | null
  links: Link[]
  onCreate: (from: string, to: string) => void
  onUpdate: (id: string, patch: Partial<Pick<Link, 'from' | 'to' | 'style'>>) => void
  onRemove: (id: string) => void
  children: ReactNode
}

export function ArrowsProvider({ weekNode, links, onCreate, onUpdate, onRemove, children }: ArrowsProviderProps) {
  const elMap = useRef(new Map<string, HTMLElement>())
  const [drag, setDrag] = useState<Drag | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [menu, setMenu] = useState<{ linkId: string; x: number; y: number } | null>(null)

  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const linksRef = useRef<Link[]>(links)
  linksRef.current = links

  const toContent = useCallback(
    (clientX: number, clientY: number) => {
      if (!weekNode) return { x: clientX, y: clientY }
      const r = weekNode.getBoundingClientRect()
      return { x: clientX - r.left + weekNode.scrollLeft, y: clientY - r.top + weekNode.scrollTop }
    },
    [weekNode],
  )

  const getRect = useCallback(
    (id: string) => {
      const el = elMap.current.get(id)
      if (!el || !weekNode) return null
      const r = el.getBoundingClientRect()
      const wr = weekNode.getBoundingClientRect()
      return { x: r.left - wr.left + weekNode.scrollLeft, y: r.top - wr.top + weekNode.scrollTop, w: r.width, h: r.height }
    },
    [weekNode],
  )

  const getAllRects = useCallback(() => {
    const out: Rect[] = []
    if (!weekNode) return out
    const wr = weekNode.getBoundingClientRect()
    for (const [id, el] of elMap.current) {
      const r = el.getBoundingClientRect()
      out.push({ id, x: r.left - wr.left + weekNode.scrollLeft, y: r.top - wr.top + weekNode.scrollTop, w: r.width, h: r.height })
    }
    return out
  }, [weekNode])

  const registerEl = useCallback((id: string, el: HTMLElement | null) => {
    if (el) elMap.current.set(id, el)
    else elMap.current.delete(id)
  }, [])

  const finish = useCallback(
    (clientX: number, clientY: number) => {
      const d = dragRef.current
      if (d) {
        const el = document.elementFromPoint(clientX, clientY)
        const cardEl = el?.closest?.('.task') as HTMLElement | null
        const toId = cardEl?.dataset.taskId
        if (d.kind === 'new') {
          if (toId && toId !== d.from) onCreate(d.from, toId)
        } else {
          const link = linksRef.current.find((l) => l.id === d.linkId)
          if (link && toId && toId !== (d.end === 'to' ? link.from : link.to)) {
            onUpdate(link.id, d.end === 'to' ? { to: toId } : { from: toId })
          }
        }
      }
      setDrag(null)
      setCursor(null)
    },
    [onCreate, onUpdate],
  )

  const onMove = useCallback(
    (e: MouseEvent) => {
      setCursor(toContent(e.clientX, e.clientY))
    },
    [toContent],
  )

  const onUp = useCallback(
    (e: MouseEvent) => {
      finish(e.clientX, e.clientY)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    },
    [finish, onMove],
  )

  const beginDrag = useCallback(
    (d: Drag, clientX: number, clientY: number) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      dragRef.current = d
      setDrag(d)
      setCursor(toContent(clientX, clientY))
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [onMove, onUp, toContent],
  )

  const startConnection = useCallback(
    (from: string, side: 'left' | 'right', e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      beginDrag({ kind: 'new', from, side }, e.clientX, e.clientY)
    },
    [beginDrag],
  )

  const onArrowDown = useCallback(
    (link: Link, e: React.PointerEvent<SVGPathElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const a = getRect(link.from)
      const b = getRect(link.to)
      const dx = !a || !b ? 1 : b.x + b.w / 2 >= a.x + a.w / 2 ? 1 : -1
      const pFrom = a ? { x: dx === 1 ? a.x + a.w : a.x, y: a.y + a.h / 2 } : null
      const pTo = b ? { x: dx === 1 ? b.x : b.x + b.w, y: b.y + b.h / 2 } : null
      const toView = (p: { x: number; y: number }) => {
        if (!weekNode) return p
        const wr = weekNode.getBoundingClientRect()
        return { x: p.x - weekNode.scrollLeft + wr.left, y: p.y - weekNode.scrollTop + wr.top }
      }
      const end: 'from' | 'to' =
        !pFrom || !pTo
          ? 'to'
          : Math.hypot(e.clientX - toView(pFrom).x, e.clientY - toView(pFrom).y) <
            Math.hypot(e.clientX - toView(pTo).x, e.clientY - toView(pTo).y)
            ? 'from'
            : 'to'
      beginDrag({ kind: 'move', linkId: link.id, end }, e.clientX, e.clientY)
    },
    [beginDrag, getRect, weekNode],
  )

  const openMenu = useCallback((linkId: string, x: number, y: number) => setMenu({ linkId, x, y }), [])
  const closeMenu = useCallback(() => setMenu(null), [])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const value: ArrowsContextValue = {
    links,
    weekNode,
    getRect,
    getAllRects,
    registerEl,
    startConnection,
    onArrowDown,
    drag,
    cursor,
    menu,
    openMenu,
    closeMenu,
    onRemove,
    onUpdate,
  }

  return <ArrowsContext.Provider value={value}>{children}</ArrowsContext.Provider>
}

const bezier = (a: Pt, b: Pt) => {
  const dx = b.x >= a.x ? 1 : -1
  const k = Math.max(24, Math.abs(b.x - a.x) / 2)
  return `M ${a.x} ${a.y} C ${a.x + dx * k} ${a.y}, ${b.x - dx * k} ${b.y}, ${b.x} ${b.y}`
}

const exitPoint = (r: { x: number; y: number; w: number; h: number }, target: Pt) => {
  const dx = target.x >= r.x + r.w / 2 ? 1 : -1
  return { x: dx === 1 ? r.x + r.w : r.x, y: r.y + r.h / 2 }
}

function overlapsX(o: Rect, x: number, pad: number): boolean {
  return o.x - pad <= x && x <= o.x + o.w + pad
}

function crossesVertical(o: Rect, x: number, yFrom: number, yTo: number): boolean {
  if (!overlapsX(o, x, 6)) return false
  const lo = Math.min(yFrom, yTo)
  const hi = Math.max(yFrom, yTo)
  return o.y < hi && o.y + o.h > lo
}

function chooseLane(p1: Pt, p2: Pt, obstacles: Rect[]): number {
  const xmin = Math.min(p1.x, p2.x)
  const xmax = Math.max(p1.x, p2.x)
  const band = obstacles.filter((o) => o.x < xmax && o.x + o.w > xmin)
  const cand = new Set<number>([p1.y, p2.y, (p1.y + p2.y) / 2])
  for (const o of obstacles) {
    cand.add(o.y - 20)
    cand.add(o.y + o.h + 20)
  }
  let best = (p1.y + p2.y) / 2
  let bestScore = -Infinity
  for (const cy of cand) {
    if (cy < -500 || cy > 100000) continue
    let blocked = false
    for (const o of band) {
      if (cy >= o.y - 2 && cy <= o.y + o.h + 2) {
        blocked = true
        break
      }
    }
    if (blocked) continue
    let verticalOk = true
    for (const o of obstacles) {
      if (crossesVertical(o, p1.x, p1.y, cy) || crossesVertical(o, p2.x, p2.y, cy)) {
        verticalOk = false
        break
      }
    }
    if (!verticalOk) continue
    let score = Infinity
    for (const o of obstacles) {
      score = Math.min(score, Math.abs(cy - (o.y - 2)), Math.abs(cy - (o.y + o.h + 2)))
    }
    if (score > bestScore) {
      bestScore = score
      best = cy
    }
  }
  return best
}

function orthoD(p1: Pt, p2: Pt, laneY: number, r: number): string {
  if (Math.abs(p1.x - p2.x) < 1) return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
  if (Math.abs(p1.y - p2.y) < 1) return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
  const h = p2.x >= p1.x ? 1 : -1
  if (r <= 0) {
    return `M ${p1.x} ${p1.y} L ${p1.x} ${laneY} L ${p2.x} ${laneY} L ${p2.x} ${p2.y}`
  }
  const s1 = Math.sign(laneY - p1.y)
  const s2 = Math.sign(p2.y - laneY)
  const rr = Math.max(2, Math.min(r, Math.abs(laneY - p1.y) / 2, Math.abs(p2.y - laneY) / 2))
  const sw1 = s1 === h ? 1 : 0
  const sw2 = h === s2 ? 1 : 0
  return `M ${p1.x} ${p1.y} L ${p1.x} ${laneY - s1 * rr} A ${rr} ${rr} 0 0 ${sw1} ${p1.x + h * rr} ${laneY} L ${p2.x - h * rr} ${laneY} A ${rr} ${rr} 0 0 ${sw2} ${p2.x} ${laneY + s2 * rr} L ${p2.x} ${p2.y}`
}

function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sketchD(p1: Pt, p2: Pt, laneY: number, seedStr: string): string {
  const rand = mulberry32(hashSeed(seedStr))
  const corners: Pt[] = [
    p1,
    { x: p1.x, y: laneY },
    { x: p2.x, y: laneY },
    p2,
  ]
  const samples: Pt[] = []
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i]
    const b = corners[i + 1]
    const steps = Math.max(3, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 14))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      samples.push({ x: a.x + (b.x - a.x) * t + (rand() - 0.5) * 4, y: a.y + (b.y - a.y) * t + (rand() - 0.5) * 4 })
    }
  }
  samples.push({ ...corners[corners.length - 1] })
  let d = `M ${samples[0].x} ${samples[0].y}`
  for (let i = 1; i < samples.length - 1; i++) {
    const mx = (samples[i].x + samples[i + 1].x) / 2
    const my = (samples[i].y + samples[i + 1].y) / 2
    d += ` Q ${samples[i].x} ${samples[i].y} ${mx} ${my}`
  }
  const last = samples[samples.length - 1]
  d += ` Q ${last.x} ${last.y} ${last.x} ${last.y}`
  return d
}

export function buildArrowPath(p1: Pt, p2: Pt, style: ArrowStyle | undefined, obstacles: Rect[]): string {
  const type = style?.type ?? 'routed'
  if (type === 'straight') return bezier(p1, p2)
  const lane = type === 'routed' || type === 'sketch' ? chooseLane(p1, p2, obstacles) : (p1.y + p2.y) / 2
  if (type === 'elbow') return orthoD(p1, p2, lane, 0)
  if (type === 'rounded') return orthoD(p1, p2, lane, 12)
  if (type === 'routed') return orthoD(p1, p2, lane, 6)
  if (type === 'sketch') return sketchD(p1, p2, lane, `${p1.x}|${p1.y}|${p2.x}|${p2.y}`)
  return bezier(p1, p2)
}

export function ArrowsLayer() {
  const { weekNode, links, getRect, getAllRects, drag, cursor, menu, openMenu, closeMenu, onArrowDown, onRemove, onUpdate } =
    useArrows()
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!weekNode) return
    const bump = () => setTick((t) => t + 1)
    weekNode.addEventListener('scroll', bump, true)
    window.addEventListener('resize', bump)
    const ro = new ResizeObserver(bump)
    ro.observe(weekNode)
    return () => {
      weekNode.removeEventListener('scroll', bump, true)
      window.removeEventListener('resize', bump)
      ro.disconnect()
    }
  }, [weekNode])

  const size = weekNode ? { w: weekNode.scrollWidth, h: weekNode.clientHeight } : { w: 0, h: 0 }
  const obstacles = getAllRects()

  const arrowPaths = links.flatMap((link) => {
    const a = getRect(link.from)
    const b = getRect(link.to)
    if (!a || !b) return []
    const dir = b.x + b.w / 2 >= a.x + a.w / 2 ? 1 : -1
    const p1 = { x: dir === 1 ? a.x + a.w : a.x, y: a.y + a.h / 2 }
    const p2 = { x: dir === 1 ? b.x : b.x + b.w, y: b.y + b.h / 2 }
    const obs = obstacles.filter((r) => r.id !== link.from && r.id !== link.to)
    return [{ link, p1, p2, d: buildArrowPath(p1, p2, link.style, obs) }]
  })

  let ghost: { from: Pt; to: Pt } | null = null
  if (drag && cursor) {
    if (drag.kind === 'new') {
      const a = getRect(drag.from)
      if (a) ghost = { from: exitPoint(a, cursor), to: cursor }
    } else {
      const link = links.find((l) => l.id === drag.linkId)
      if (link) {
        const a = getRect(link.from)
        const b = getRect(link.to)
        if (drag.end === 'to' && a) ghost = { from: exitPoint(a, cursor), to: cursor }
        else if (drag.end === 'from' && b) ghost = { from: cursor, to: exitPoint(b, cursor) }
      }
    }
  }

  const markerOf = (color: string) => {
    const idx = ARROW_COLORS.indexOf(color)
    return `url(#ah-${idx >= 0 ? idx : 0})`
  }

  return (
    <>
      <svg className="arrows-svg" width={size.w} height={size.h}>
        <defs>
          {ARROW_COLORS.map((c, i) => (
            <marker
              key={i}
              id={`ah-${i}`}
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M2,2 L11,6 L2,10 z" fill={c} />
            </marker>
          ))}
          <marker id="ah-ghost" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M2,2 L11,6 L2,10 z" fill={ARROW_COLOR} fillOpacity={0.7} />
          </marker>
        </defs>
        {arrowPaths.map(({ link, d }) => {
          const s = link.style ?? {}
          const style: CSSProperties = {
            stroke: s.color ?? ARROW_COLOR,
            strokeWidth: s.width ?? 2,
            ...(s.dashed ? { strokeDasharray: '6 5' } : {}),
          }
          return (
            <path
              key={link.id}
              className="arrow-line"
              d={d}
              style={style}
              markerEnd={markerOf(s.color ?? ARROW_COLOR)}
              onPointerDown={(e) => onArrowDown(link, e)}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                openMenu(link.id, e.clientX, e.clientY)
              }}
            />
          )
        })}
        {ghost && (
          <path
            className="arrow-line ghost"
            d={buildArrowPath(ghost.from, ghost.to, { type: 'routed' }, obstacles)}
            markerEnd="url(#ah-ghost)"
          />
        )}
      </svg>
      {menu &&
        (() => {
          const link = links.find((l) => l.id === menu.linkId)
          const st = link?.style ?? {}
          const set = (patch: Partial<ArrowStyle>) => {
            if (link) onUpdate(link.id, { style: { ...st, ...patch } })
          }
          return (
            <div className="arrow-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
              <div className="menu-label">Тип линии</div>
              <div className="menu-row">
                {(Object.keys(TYPE_LABEL) as ArrowType[]).map((t) => (
                  <button key={t} className={`menu-chip${st.type === t ? ' on' : ''}`} onClick={() => set({ type: t })}>
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
              <div className="menu-label">Цвет</div>
              <div className="menu-row">
                {ARROW_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`menu-color${st.color === c || (!st.color && c === ARROW_COLOR) ? ' on' : ''}`}
                    style={{ background: c }}
                    onClick={() => set({ color: c })}
                    aria-label={`Цвет ${c}`}
                  />
                ))}
              </div>
              <div className="menu-label">Толщина</div>
              <div className="menu-row">
                {[1, 2, 3, 4, 5].map((w) => (
                  <button key={w} className={`menu-chip${st.width === w || (!st.width && w === 2) ? ' on' : ''}`} onClick={() => set({ width: w })}>
                    {w}
                  </button>
                ))}
              </div>
              <button className={`menu-chip full${st.dashed ? ' on' : ''}`} onClick={() => set({ dashed: !st.dashed })}>
                Пунктирная
              </button>
              <button
                className="arrow-menu-btn menu-chip full danger"
                onClick={() => {
                  onRemove(menu.linkId)
                  closeMenu()
                }}
              >
                Удалить стрелку
              </button>
            </div>
          )
        })()}
    </>
  )
}
