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
import type { ArrowStyle, ArrowType, Link, LinkType } from './types'
import { LINK_TYPE_LABEL } from './types'

/* ── constants ── */

export const ARROW_COLOR = '#4f7cff'
export const ARROW_COLORS = [
  '#4f7cff', '#33332f', '#d9534f', '#e67e22', '#f1c40f',
  '#27ae60', '#8e44ad', '#3498db', '#7f8c8d',
]

const TYPE_LABEL: Record<ArrowType, string> = {
  straight: 'Прямая', elbow: 'Углы', rounded: 'Скругл.',
  routed: 'Огибающая', sketch: 'Скетч',
}

/* ── types ── */

type Pt = { x: number; y: number }
type Rect = { id: string; x: number; y: number; w: number; h: number }

type Drag =
  | { kind: 'new'; from: string; startX: number; startY: number }
  | { kind: 'move'; linkId: string; end: 'from' | 'to'; startX: number; startY: number }

/* ── path math ── */

function bezier(a: Pt, b: Pt) {
  const dx = b.x >= a.x ? 1 : -1
  const k = Math.max(24, Math.abs(b.x - a.x) / 2)
  return `M ${a.x} ${a.y} C ${a.x + dx * k} ${a.y}, ${b.x - dx * k} ${b.y}, ${b.x} ${b.y}`
}

function overlapsX(o: { x: number; w: number }, x: number, pad: number) {
  return o.x - pad <= x && x <= o.x + o.w + pad
}

function crossesVertical(o: Rect, x: number, yFrom: number, yTo: number) {
  if (!overlapsX(o, x, 6)) return false
  const lo = Math.min(yFrom, yTo), hi = Math.max(yFrom, yTo)
  return o.y < hi && o.y + o.h > lo
}

function chooseLane(p1: Pt, p2: Pt, obs: Rect[]) {
  const xmin = Math.min(p1.x, p2.x), xmax = Math.max(p1.x, p2.x)
  const band = obs.filter(o => o.x < xmax && o.x + o.w > xmin)
  const cand = new Set<number>([p1.y, p2.y, (p1.y + p2.y) / 2])
  for (const o of obs) { cand.add(o.y - 20); cand.add(o.y + o.h + 20) }
  let best = (p1.y + p2.y) / 2, bestScore = -Infinity
  for (const cy of cand) {
    if (cy < -500 || cy > 100000) continue
    if (band.some(o => cy >= o.y - 2 && cy <= o.y + o.h + 2)) continue
    if (obs.some(o => crossesVertical(o, p1.x, p1.y, cy) || crossesVertical(o, p2.x, p2.y, cy))) continue
    let score = Infinity
    for (const o of obs) score = Math.min(score, Math.abs(cy - (o.y - 2)), Math.abs(cy - (o.y + o.h + 2)))
    if (score > bestScore) { bestScore = score; best = cy }
  }
  return best
}

function orthoH(p1: Pt, p2: Pt, laneY: number, r: number, stub = 10) {
  if (Math.abs(p1.x - p2.x) < 1 || Math.abs(p1.y - p2.y) < 1)
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`

  const h = p2.x >= p1.x ? 1 : -1
  const s1 = Math.sign(laneY - p1.y) || 1
  const s2 = Math.sign(p2.y - laneY) || 1
  let sx1 = p1.x + h * stub, sx2 = p2.x - h * stub
  if ((h === 1 && sx1 >= sx2) || (h === -1 && sx1 <= sx2)) { sx1 = sx2 = (p1.x + p2.x) / 2 }

  if (r <= 0)
    return `M ${p1.x} ${p1.y} L ${sx1} ${p1.y} L ${sx1} ${laneY} L ${sx2} ${laneY} L ${sx2} ${p2.y} L ${p2.x} ${p2.y}`

  const v1 = Math.abs(laneY - p1.y), v2 = Math.abs(p2.y - laneY), hm = Math.abs(sx2 - sx1)
  if (v1 < 4 || v2 < 4)
    return `M ${p1.x} ${p1.y} L ${sx1} ${p1.y} L ${sx1} ${laneY} L ${sx2} ${laneY} L ${sx2} ${p2.y} L ${p2.x} ${p2.y}`

  const rr = Math.max(2, Math.min(r, v1 / 2, v2 / 2, hm / 2, stub))
  const sw1 = h === s1 ? 1 : 0, sw2 = s1 === h ? 1 : 0, sw3 = h === s2 ? 1 : 0, sw4 = s2 === h ? 1 : 0
  return [
    `M ${p1.x} ${p1.y}`,
    `L ${sx1 - h * rr} ${p1.y}`,
    `A ${rr} ${rr} 0 0 ${sw1} ${sx1} ${p1.y + s1 * rr}`,
    `L ${sx1} ${laneY - s1 * rr}`,
    `A ${rr} ${rr} 0 0 ${sw2} ${sx1 + h * rr} ${laneY}`,
    `L ${sx2 - h * rr} ${laneY}`,
    `A ${rr} ${rr} 0 0 ${sw3} ${sx2} ${laneY + s2 * rr}`,
    `L ${sx2} ${p2.y - s2 * rr}`,
    `A ${rr} ${rr} 0 0 ${sw4} ${sx2 + h * rr} ${p2.y}`,
    `L ${p2.x} ${p2.y}`,
  ].join(' ')
}

function hashSeed(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sketchD(p1: Pt, p2: Pt, laneY: number, seed: string) {
  const rand = mulberry32(hashSeed(seed))
  const h = p2.x >= p1.x ? 1 : -1, stub = 10
  let sx1 = p1.x + h * stub, sx2 = p2.x - h * stub
  if ((h === 1 && sx1 >= sx2) || (h === -1 && sx1 <= sx2)) { sx1 = sx2 = (p1.x + p2.x) / 2 }
  const corners = [p1, { x: sx1, y: p1.y }, { x: sx1, y: laneY }, { x: sx2, y: laneY }, { x: sx2, y: p2.y }, p2]
  const samples: Pt[] = []
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i], b = corners[i + 1]
    const steps = Math.max(3, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 14))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      samples.push({ x: a.x + (b.x - a.x) * t + (rand() - 0.5) * 4, y: a.y + (b.y - a.y) * t + (rand() - 0.5) * 4 })
    }
  }
  samples.push({ ...corners[corners.length - 1] })
  let d = `M ${samples[0].x} ${samples[0].y}`
  for (let i = 1; i < samples.length - 1; i++) {
    const mx = (samples[i].x + samples[i + 1].x) / 2, my = (samples[i].y + samples[i + 1].y) / 2
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
  if (type === 'elbow') return orthoH(p1, p2, lane, 0)
  if (type === 'rounded') return orthoH(p1, p2, lane, 12)
  if (type === 'routed') return orthoH(p1, p2, lane, 6)
  if (type === 'sketch') return sketchD(p1, p2, lane, `${p1.x}|${p1.y}|${p2.x}|${p2.y}`)
  return bezier(p1, p2)
}

/* ── context ── */

interface ArrowsContextValue {
  links: Link[]
  container: HTMLDivElement | null
  getRect: (id: string) => Rect | null
  getAllRects: () => Rect[]
  registerEl: (id: string, el: HTMLElement | null) => void
  startConnection: (from: string, side: 'left' | 'right', e: React.MouseEvent) => void
  onArrowDown: (link: Link, e: React.PointerEvent<SVGPathElement>) => void
  drag: Drag | null
  cursor: Pt | null
  menu: { linkId: string; x: number; y: number } | null
  openMenu: (linkId: string, x: number, y: number) => void
  closeMenu: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<Pick<Link, 'from' | 'to' | 'style'>>) => void
  hoveredLink: string | null
  setHoveredLink: (id: string | null) => void
  registerInvalidate: (fn: () => void) => void
}

const Ctx = createContext<ArrowsContextValue | null>(null)

export function useArrows() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useArrows must be used within ArrowsProvider')
  return ctx
}

/* ── provider ── */

interface ArrowsProviderProps {
  weekNode: HTMLDivElement | null
  links: Link[]
  onCreate: (from: string, to: string) => void
  onUpdate: (id: string, patch: Partial<Pick<Link, 'from' | 'to' | 'style'>>) => void
  onRemove: (id: string) => void
  invalidateRef?: React.MutableRefObject<(() => void) | null>
  children: ReactNode
}

export function ArrowsProvider({ weekNode, links, onCreate, onUpdate, onRemove, invalidateRef, children }: ArrowsProviderProps) {
  const elMap = useRef(new Map<string, HTMLElement>())
  const [drag, setDrag] = useState<Drag | null>(null)
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [menu, setMenu] = useState<{ linkId: string; x: number; y: number } | null>(null)
  const [hoveredLink, setHoveredLink] = useState<string | null>(null)
  const invalidateFnRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (invalidateRef) invalidateRef.current = () => invalidateFnRef.current?.()
  }, [invalidateRef])

  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const linksRef = useRef<Link[]>(links)
  linksRef.current = links

  const toContent = useCallback((cx: number, cy: number): Pt => {
    if (!weekNode) return { x: cx, y: cy }
    const r = weekNode.getBoundingClientRect()
    return { x: cx - r.left + weekNode.scrollLeft, y: cy - r.top + weekNode.scrollTop }
  }, [weekNode])

  const getRect = useCallback((id: string): Rect | null => {
    const el = elMap.current.get(id)
    if (!el || !weekNode) return null
    const r = el.getBoundingClientRect(), wr = weekNode.getBoundingClientRect()
    return { id, x: r.left - wr.left + weekNode.scrollLeft, y: r.top - wr.top + weekNode.scrollTop, w: r.width, h: r.height }
  }, [weekNode])

  const getAllRects = useCallback((): Rect[] => {
    if (!weekNode) return []
    const wr = weekNode.getBoundingClientRect()
    const out: Rect[] = []
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

  /* ── hit test: iterate elMap rects, find first containing the point ── */
  const findTaskAtPoint = useCallback((cx: number, cy: number, excludeId?: string): string | null => {
    if (!weekNode) return null
    const wr = weekNode.getBoundingClientRect()
    const px = cx - wr.left + weekNode.scrollLeft
    const py = cy - wr.top + weekNode.scrollTop
    for (const [id, el] of elMap.current) {
      if (id === excludeId) continue
      const r = el.getBoundingClientRect()
      const rx = r.left - wr.left + weekNode.scrollLeft
      const ry = r.top - wr.top + weekNode.scrollTop
      if (px >= rx && px <= rx + r.width && py >= ry && py <= ry + r.height) return id
    }
    return null
  }, [weekNode])

  /* ── finish drag ── */
  const finish = useCallback((cx: number, cy: number) => {
    const d = dragRef.current
    if (!d) return
    if (Math.hypot(cx - d.startX, cy - d.startY) < 5) {
      setDrag(null); setCursor(null); return
    }
    const toId = d.kind === 'new'
      ? findTaskAtPoint(cx, cy, d.from)
      : findTaskAtPoint(cx, cy)
    if (d.kind === 'new') {
      if (toId && toId !== d.from) {
        const exists = linksRef.current.some(l =>
          (l.from === d.from && l.to === toId) || (l.from === toId && l.to === d.from))
        if (!exists) onCreate(d.from, toId)
      }
    } else {
      const link = linksRef.current.find(l => l.id === d.linkId)
      if (link && toId && toId !== (d.end === 'to' ? link.from : link.to))
        onUpdate(link.id, d.end === 'to' ? { to: toId } : { from: toId })
    }
    setDrag(null); setCursor(null)
  }, [onCreate, onUpdate, findTaskAtPoint])

  const finishRef = useRef(finish)
  finishRef.current = finish

  const beginDrag = useCallback((d: Drag, cx: number, cy: number) => {
    d.startX = cx; d.startY = cy
    dragRef.current = d; setDrag(d)
    setCursor(toContent(cx, cy))
    const onMove = (e: MouseEvent) => setCursor(toContent(e.clientX, e.clientY))
    const onUp = (e: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      finishRef.current(e.clientX, e.clientY)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [toContent])

  const startConnection = useCallback((from: string, side: 'left' | 'right', e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    beginDrag({ kind: 'new', from, startX: 0, startY: 0 }, e.clientX, e.clientY)
  }, [beginDrag])

  const openMenu = useCallback((linkId: string, x: number, y: number) => setMenu({ linkId, x, y }), [])
  const closeMenu = useCallback(() => setMenu(null), [])

  const onArrowDown = useCallback((link: Link, e: React.PointerEvent<SVGPathElement>) => {
    e.preventDefault(); e.stopPropagation()
    const a = getRect(link.from), b = getRect(link.to)
    const dx = !a || !b ? 1 : b.x + b.w / 2 >= a.x + a.w / 2 ? 1 : -1
    const pFrom = a ? { x: dx === 1 ? a.x + a.w : a.x, y: a.y + a.h / 2 } : null
    const pTo = b ? { x: dx === 1 ? b.x : b.x + b.w, y: b.y + b.h / 2 } : null
    const toView = (p: Pt) => {
      if (!weekNode) return p
      const wr = weekNode.getBoundingClientRect()
      return { x: p.x - weekNode.scrollLeft + wr.left, y: p.y - weekNode.scrollTop + wr.top }
    }
    const end: 'from' | 'to' = !pFrom || !pTo ? 'to' :
      Math.hypot(e.clientX - toView(pFrom).x, e.clientY - toView(pFrom).y) <
      Math.hypot(e.clientX - toView(pTo).x, e.clientY - toView(pTo).y) ? 'from' : 'to'

    const sx = e.clientX, sy = e.clientY
    let activated = false
    const onMove = (ev: MouseEvent) => {
      if (activated) return
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return
      activated = true
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      beginDrag({ kind: 'move', linkId: link.id, end, startX: sx, startY: sy }, sx, sy)
    }
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (!activated) openMenu(link.id, ev.clientX, ev.clientY)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [beginDrag, getRect, weekNode, openMenu])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const registerInvalidate = useCallback((fn: () => void) => { invalidateFnRef.current = fn }, [])

  const value: ArrowsContextValue = {
    links, container: weekNode, getRect, getAllRects, registerEl,
    startConnection, onArrowDown, drag, cursor, menu, openMenu, closeMenu,
    onRemove, onUpdate, hoveredLink, setHoveredLink, registerInvalidate,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/* ── layer ── */

export function ArrowsLayer() {
  const { container, links, getRect, getAllRects, drag, cursor, menu, openMenu, closeMenu, onArrowDown, onRemove, onUpdate, hoveredLink, setHoveredLink, registerInvalidate } = useArrows()
  const [, setTick] = useState(0)

  useEffect(() => {
    const bump = () => setTick(t => t + 1)
    registerInvalidate(bump)
  }, [registerInvalidate])

  useEffect(() => {
    if (!container) return
    const bump = () => setTick(t => t + 1)
    container.addEventListener('scroll', bump, true)
    window.addEventListener('resize', bump)
    const ro = new ResizeObserver(bump)
    ro.observe(container)
    return () => { container.removeEventListener('scroll', bump, true); window.removeEventListener('resize', bump); ro.disconnect() }
  }, [container])

  const size = container ? { w: container.scrollWidth, h: container.clientHeight } : { w: 0, h: 0 }
  const obstacles = getAllRects()

  const arrowPaths = links.flatMap(link => {
    const a = getRect(link.from), b = getRect(link.to)
    if (!a || !b) return []
    const dir = b.x + b.w / 2 >= a.x + a.w / 2 ? 1 : -1
    const p1 = { x: dir === 1 ? a.x + a.w : a.x, y: a.y + a.h / 2 }
    const p2 = { x: dir === 1 ? b.x : b.x + b.w, y: b.y + b.h / 2 }
    const obs = obstacles.filter(r => r.id !== link.from && r.id !== link.to)
    return [{ link, p1, p2, d: buildArrowPath(p1, p2, link.style, obs) }]
  })

  let ghost: { from: Pt; to: Pt } | null = null
  if (drag && cursor) {
    if (drag.kind === 'new') {
      const a = getRect(drag.from)
      if (a) {
        const dx = cursor.x >= a.x + a.w / 2 ? 1 : -1
        ghost = { from: { x: dx === 1 ? a.x + a.w : a.x, y: a.y + a.h / 2 }, to: cursor }
      }
    } else {
      const link = links.find(l => l.id === drag.linkId)
      if (link) {
        if (drag.end === 'to') {
          const a = getRect(link.from)
          if (a) { const dx = cursor.x >= a.x + a.w / 2 ? 1 : -1; ghost = { from: { x: dx === 1 ? a.x + a.w : a.x, y: a.y + a.h / 2 }, to: cursor } }
        } else {
          const b = getRect(link.to)
          if (b) { const dx = cursor.x >= b.x + b.w / 2 ? 1 : -1; ghost = { from: cursor, to: { x: dx === 1 ? b.x : b.x + b.w, y: b.y + b.h / 2 } } }
        }
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
            <marker key={i} id={`ah-${i}`} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M2,2 L11,6 L2,10 z" fill={c} />
            </marker>
          ))}
          <marker id="ah-ghost" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M2,2 L11,6 L2,10 z" fill={ARROW_COLOR} fillOpacity={0.7} />
          </marker>
        </defs>
        {arrowPaths.map(({ link, d }) => {
          const s = link.style ?? {}
          const hovered = hoveredLink === link.id
          const labelPos = (() => {
            const m = d.match(/M\s+([\d.]+)\s+([\d.]+)/)
            const c = d.match(/C\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
            if (m && c) return { x: (parseFloat(m[1]) + parseFloat(c[5])) / 2, y: (parseFloat(m[2]) + parseFloat(c[6])) / 2 - 8 }
            return null
          })()
          const style: CSSProperties = {
            stroke: s.color ?? ARROW_COLOR,
            strokeWidth: hovered ? (s.width ?? 2) + 2 : (s.width ?? 2),
            ...(s.dashed ? { strokeDasharray: '6 5' } : {}),
            transition: 'stroke-width 0.15s ease',
          }
          return (
            <g key={link.id}>
              <path className="arrow-hit" d={d} fill="none" stroke="transparent" strokeWidth={14}
                onPointerDown={e => onArrowDown(link, e)}
                onPointerEnter={() => setHoveredLink(link.id)}
                onPointerLeave={() => setHoveredLink(null)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMenu(link.id, e.clientX, e.clientY) }}
              />
              <path className={`arrow-line${hovered ? ' hovered' : ''}${s.dashed ? ' dashed' : ''}`} d={d} style={style} markerEnd={markerOf(s.color ?? ARROW_COLOR)} />
              {labelPos && s.label && (
                <text className="arrow-label" x={labelPos.x} y={labelPos.y} textAnchor="middle" fill={s.color ?? ARROW_COLOR} fontSize={11} fontWeight={500}>{s.label}</text>
              )}
              {labelPos && s.linkType && !s.label && (
                <text className="arrow-label" x={labelPos.x} y={labelPos.y} textAnchor="middle" fill={s.color ?? ARROW_COLOR} fontSize={10} fontWeight={400} opacity={0.7}>{LINK_TYPE_LABEL[s.linkType]}</text>
              )}
            </g>
          )
        })}
        {ghost && (
          <path className="arrow-line ghost" d={buildArrowPath(ghost.from, ghost.to, { type: 'routed' }, obstacles)} markerEnd="url(#ah-ghost)" />
        )}
      </svg>
      {menu && (() => {
        const link = links.find(l => l.id === menu.linkId)
        const st = link?.style ?? {}
        const set = (patch: Partial<ArrowStyle>) => { if (link) onUpdate(link.id, { style: { ...st, ...patch } }) }
        return (
          <div className="arrow-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={e => e.stopPropagation()}>
            <div className="menu-label">Тип линии</div>
            <div className="menu-row">
              {(Object.keys(TYPE_LABEL) as ArrowType[]).map(t => (
                <button key={t} className={`menu-chip${st.type === t ? ' on' : ''}`} onClick={() => set({ type: t })}>{TYPE_LABEL[t]}</button>
              ))}
            </div>
            <div className="menu-label">Семантика</div>
            <div className="menu-row">
              {(Object.keys(LINK_TYPE_LABEL) as LinkType[]).map(lt => (
                <button key={lt} className={`menu-chip${st.linkType === lt ? ' on' : ''}`} onClick={() => set({ linkType: lt })}>{LINK_TYPE_LABEL[lt]}</button>
              ))}
            </div>
            <div className="menu-label">Цвет</div>
            <div className="menu-row">
              {ARROW_COLORS.map(c => (
                <button key={c} className={`menu-color${st.color === c || (!st.color && c === ARROW_COLOR) ? ' on' : ''}`} style={{ background: c }} onClick={() => set({ color: c })} aria-label={`Цвет ${c}`} />
              ))}
            </div>
            <div className="menu-label">Толщина</div>
            <div className="menu-row">
              {[1, 2, 3, 4, 5].map(w => (
                <button key={w} className={`menu-chip${st.width === w || (!st.width && w === 2) ? ' on' : ''}`} onClick={() => set({ width: w })}>{w}</button>
              ))}
            </div>
            <button className={`menu-chip full${st.dashed ? ' on' : ''}`} onClick={() => set({ dashed: !st.dashed })}>Пунктирная</button>
            <div className="menu-label">Метка</div>
            <div className="menu-row">
              <input className="menu-input" value={st.label ?? ''} onChange={e => set({ label: e.target.value || undefined })} placeholder="Текст на линии…" maxLength={40} />
            </div>
            <button className="arrow-menu-btn menu-chip full danger" onClick={() => { onRemove(menu.linkId); closeMenu() }}>Удалить стрелку</button>
          </div>
        )
      })()}
    </>
  )
}
