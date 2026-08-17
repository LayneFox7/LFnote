import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CardStyle, Folder, FilterType, Link, Task, User, View } from './types'
import {
  apiLogin,
  apiLogout,
  apiMe,
  apiRegister,
  batchUpdate,
  clearColumnColor as apiClearColumnColor,
  createFolder,
  createLink,
  createTag,
  createTask,
  deleteFolder,
  deleteLink,
  deleteTag as apiDeleteTag,
  deleteTask,
  fetchColumns,
  fetchFolders,
  fetchLinks,
  fetchTags,
  fetchTasks,
  renameFolder,
  renameTag as apiRenameTag,
  setColumnColor as apiSetColumnColor,
  updateLink,
  updateTask,
  type BatchUpdate,
} from './api'
import { clipboardText, countCheckboxes, toggleCheckboxInHtml } from './sanitize'
import { addDays, toISODate, isToday, isPast, formatDayHeader } from './date'
import { DayColumn } from './components/DayColumn'
import { GanttView } from './components/GanttView'
import { ListView } from './components/ListView'
import { RowsView } from './components/RowsView'
import { WeekStrip } from './components/WeekStrip'
import { FormatToolbar } from './components/FormatToolbar'
import { TagBar } from './components/TagBar'
import { FolderBar } from './components/FolderBar'
import { LoginScreen } from './components/LoginScreen'
import { ArrowsProvider, ArrowsLayer } from './arrows'
import type { EditorApi } from './editor'
import './App.css'

const DEFAULT_WIDTH = 190
const MIN_WIDTH = 140
const MAX_WIDTH = 440

const loadNumDays = (): number => {
  try {
    const n = Number(localStorage.getItem('planner.numDays'))
    if (n === 3 || n === 5 || n === 7) return n
  } catch {}
  return 7
}

const loadWidths = (count: number): number[] => {
  try {
    const raw = localStorage.getItem('planner.colWidths')
    const obj = raw ? (JSON.parse(raw) as Record<string, number[]>) : {}
    const arr = obj[String(count)]
    if (Array.isArray(arr) && arr.length === count && arr.every((n) => typeof n === 'number' && n > 0)) return arr
  } catch {}
  return Array(count).fill(DEFAULT_WIDTH)
}

interface NavState {
  day: number
  taskId: string | null
}

interface NewRequest {
  dayIndex: number
  ts: number
}

interface MarqueeRect {
  x: number
  y: number
  w: number
  h: number
}

function useMarqueeSelect(container: HTMLElement | null, onSelect: (ids: string[]) => void): MarqueeRect | null {
  const [rect, setRect] = useState<MarqueeRect | null>(null)

  useEffect(() => {
    if (!container) return
    const isIgnored = (el: HTMLElement | null) =>
      !!el?.closest?.('button, input, textarea, a, .task, .conn-handle, [contenteditable="true"]')

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return
      if (isIgnored(e.target as HTMLElement)) return
      const startX = e.clientX
      const startY = e.clientY
      let active = false

      const onMove = (ev: MouseEvent) => {
        if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return
        if (!active) {
          active = true
          document.body.classList.add('marquee-active')
        }
        const r = container.getBoundingClientRect()
        setRect({
          x: ev.clientX - r.left,
          y: ev.clientY - r.top,
          w: ev.clientX - startX,
          h: ev.clientY - startY,
        })
        const sel = {
          left: Math.min(startX, ev.clientX),
          top: Math.min(startY, ev.clientY),
          right: Math.max(startX, ev.clientX),
          bottom: Math.max(startY, ev.clientY),
        }
        const ids: string[] = []
        container.querySelectorAll<HTMLElement>('.task').forEach((el) => {
          const b = el.getBoundingClientRect()
          if (b.right < sel.left || b.left > sel.right || b.bottom < sel.top || b.top > sel.bottom) return
          const id = el.dataset.taskId
          if (id) ids.push(id)
        })
        onSelect(ids)
      }

      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        document.body.classList.remove('marquee-active')
        setRect(null)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    container.addEventListener('mousedown', onDown)
    return () => container.removeEventListener('mousedown', onDown)
  }, [container, onSelect])

  return rect
}

function App() {
  const [view, setView] = useState<View>('week')
  const [numDays, setNumDays] = useState<number>(loadNumDays)
  const [tasks, setTasks] = useState<Task[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [centerIso, setCenterIso] = useState(() => toISODate(new Date()))
  const [columnColors, setColumnColors] = useState<Record<string, string>>({})
  const [colWidths, setColWidths] = useState<number[]>(() => loadWidths(loadNumDays()))
  const [selectedSet, setSelectedSet] = useState<Set<string>>(() => new Set())
  const [cardDrag, setCardDrag] = useState<{ x: number; y: number; overIso: string | null } | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null)
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nav, setNav] = useState<NavState>({ day: -1, taskId: null })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newRequest, setNewRequest] = useState<NewRequest | null>(null)
  const [editorApi, setEditorApi] = useState<EditorApi | null>(null)
  const [weekNode, setWeekNode] = useState<HTMLDivElement | null>(null)
  const [rowsNode, setRowsNode] = useState<HTMLDivElement | null>(null)
  const [listNode, setListNode] = useState<HTMLDivElement | null>(null)

  const cardDragRef = useRef<{ taskId: string; el: HTMLElement; startX: number; startY: number; dragging: boolean } | null>(null)
  const suppressClick = useRef(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [list, linkList, cols, tagList, folderList] = await Promise.all([
        fetchTasks(),
        fetchLinks(),
        fetchColumns(),
        fetchTags(),
        fetchFolders(),
      ])
      setTasks(list)
      setLinks(linkList)
      setColumnColors(cols)
      setTags(tagList)
      setFolders(folderList)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    apiMe()
      .then((u) => {
        setUser(u)
        if (u) return loadData()
      })
      .catch((e) => setError(String(e)))
      .finally(() => setAuthChecked(true))
  }, [loadData])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('planner.colWidths')
      const obj = raw ? (JSON.parse(raw) as Record<string, number[]>) : {}
      obj[String(numDays)] = colWidths
      localStorage.setItem('planner.colWidths', JSON.stringify(obj))
    } catch {}
  }, [colWidths, numDays])

  useEffect(() => {
    try {
      localStorage.setItem('planner.numDays', String(numDays))
    } catch {}
  }, [numDays])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (suppressClick.current) {
        e.stopPropagation()
        e.preventDefault()
        suppressClick.current = false
      }
    }
    document.addEventListener('click', onDocClick, true)
    return () => document.removeEventListener('click', onDocClick, true)
  }, [])

  const center = new Date(`${centerIso}T12:00:00`)
  const days = Array.from({ length: numDays }, (_, i) => addDays(center, i - Math.floor(numDays / 2)))
  const weekMonth = center.getMonth()

  const matchesFilter = useCallback(
    (t: Task) => {
      const folderOk = selectedFolder === null || (t.folderId ?? null) === selectedFolder
      const type = t.type ?? 'task'
      const typeOk = filterType === 'all' || (filterType === 'tasks' && type === 'task') || (filterType === 'notes' && type === 'note')
      return folderOk && typeOk && (activeTags.length === 0 || activeTags.every((tg) => (t.tags ?? []).includes(tg)))
    },
    [activeTags, selectedFolder, filterType],
  )

  const openTasksOf = useCallback(
    (iso: string) =>
      tasks.filter((t) => t.date === iso && !t.done && matchesFilter(t)).sort((a, b) => a.order - b.order),
    [tasks, matchesFilter],
  )

  const openByIso = useMemo(() => {
    const m: Record<string, Task[]> = {}
    for (const t of tasks) {
      if (t.done || !matchesFilter(t)) continue
      const arr = m[t.date]
      if (arr) arr.push(t)
      else m[t.date] = [t]
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.order - b.order)
    return m
  }, [tasks, matchesFilter])

  const doneByIso = useMemo(() => {
    const m: Record<string, Task[]> = {}
    for (const t of tasks) {
      if (!t.done || !matchesFilter(t)) continue
      const arr = m[t.date]
      if (arr) arr.push(t)
      else m[t.date] = [t]
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    return m
  }, [tasks, matchesFilter])

  const multiDayNotes = useMemo(() => {
    return tasks.filter((t) => t.type === 'note' && t.startDate && t.endDate && t.startDate !== t.endDate)
  }, [tasks])

  const spanNotesForDay = useCallback(
    (iso: string) => {
      return multiDayNotes.filter((t) => t.startDate! <= iso && t.endDate! >= iso).sort((a, b) => {
        if (a.startDate !== b.startDate) return (a.startDate ?? '').localeCompare(b.startDate ?? '')
        if (a.endDate !== b.endDate) return (a.endDate ?? '').localeCompare(b.endDate ?? '')
        return a.order - b.order
      })
    },
    [multiDayNotes],
  )

  useEffect(() => {
    if (view !== 'week') return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable="true"]')) return
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) return
      e.preventDefault()

      const todayIdx = days.findIndex((d) => isToday(toISODate(d)))
      let day = nav.day === -1 ? (todayIdx >= 0 ? todayIdx : 0) : nav.day
      let taskId = nav.taskId

      if (e.key === 'ArrowLeft') day = Math.max(0, day - 1)
      else if (e.key === 'ArrowRight') day = Math.min(numDays - 1, day + 1)
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const list = openTasksOf(toISODate(days[day]))
        const idx = list.findIndex((x) => x.id === taskId)
        const next = list[idx + (e.key === 'ArrowDown' ? 1 : -1)]
        taskId = next ? next.id : list[0]?.id ?? null
      } else if (e.key === 'Enter') {
        setNav({ day, taskId })
        if (taskId) setEditingId(taskId)
        else setNewRequest({ dayIndex: day, ts: Date.now() })
        return
      } else if (e.key === 'Escape') {
        setNav({ day: -1, taskId: null })
        setSelectedSet(new Set())
        return
      }

      const list = openTasksOf(toISODate(days[day]))
      if (!list.some((x) => x.id === taskId)) taskId = list[0]?.id ?? null
      setNav({ day, taskId })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, days, openTasksOf, view, numDays])

  useEffect(() => {
    const w = weekNode
    if (!w) return
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return
      e.preventDefault()
      const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? w.clientWidth : 1
      const delta = (e.deltaY || e.deltaX) * factor
      w.scrollLeft += delta
    }
    w.addEventListener('wheel', onWheel, { passive: false })
    return () => w.removeEventListener('wheel', onWheel)
  }, [weekNode])

  const handleLogin = useCallback(
    async (login: string, password: string) => {
      const u = await apiLogin(login, password)
      setUser(u)
      await loadData()
    },
    [loadData],
  )

  const handleRegister = useCallback(
    async (login: string, password: string) => {
      const u = await apiRegister(login, password)
      setUser(u)
      await loadData()
    },
    [loadData],
  )

  const handleLogout = useCallback(async () => {
    try {
      await apiLogout()
    } catch {
      // игнорируем ошибку выхода, всё равно сбрасываем клиент
    }
    setUser(null)
    setTasks([])
    setLinks([])
    setTags([])
    setActiveTags([])
    setColumnColors({})
    setFolders([])
    setSelectedFolder(null)
  }, [])

  const handleCreateFolder = useCallback(async (name: string) => {
    try {
      const f = await createFolder(name)
      setFolders((prev) => [...prev, f])
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const handleRenameFolder = useCallback(async (id: number, name: string) => {
    try {
      const f = await renameFolder(id, name)
      setFolders((prev) => prev.map((x) => (x.id === id ? f : x)))
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const handleDeleteFolder = useCallback(async (id: number) => {
    try {
      await deleteFolder(id)
    } catch (e) {
      setError(String(e))
      return
    }
    setFolders((prev) => prev.filter((x) => x.id !== id))
    setTasks((prev) => prev.map((t) => (t.folderId === id ? { ...t, folderId: null } : t)))
    setSelectedFolder((prev) => (prev === id ? null : prev))
  }, [])

  const handleAssignFolder = useCallback(async (taskId: string, folderId: number | null) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, folderId } : t)))
    try {
      await updateTask(taskId, { folderId })
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const handleAdd = useCallback(async (text: string, date: Date, type?: 'task' | 'note') => {
    try {
      const task = await createTask(text, toISODate(date), { type: type ?? 'task' })
      setTasks((prev) => [...prev, task])
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const handleToggle = useCallback(async (task: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)))
    try {
      await updateTask(task.id, { done: !task.done })
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    const removed = links.filter((l) => l.from === id || l.to === id)
    if (removed.length > 0) {
      setLinks((prev) => prev.filter((l) => l.from !== id && l.to !== id))
      removed.forEach((l) => void deleteLink(l.id))
    }
    try {
      await deleteTask(id)
    } catch (e) {
      setError(String(e))
    }
  }, [links])

  const handleCreateLink = useCallback(async (from: string, to: string) => {
    if (links.some((l) => l.from === from && l.to === to)) return
    try {
      const link = await createLink(from, to)
      setLinks((prev) => [...prev, link])
    } catch (e) {
      setError(String(e))
    }
  }, [links])

  const handleUpdateLink = useCallback(async (id: string, patch: Partial<Pick<Link, 'from' | 'to' | 'style'>>) => {
    const current = links.find((l) => l.id === id)
    if (!current) return
    const next = { ...current, ...patch }
    if (next.from === next.to) return
    if (links.some((l) => l.id !== id && l.from === next.from && l.to === next.to)) return
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    try {
      await updateLink(id, patch)
    } catch (e) {
      setError(String(e))
    }
  }, [links])

  const handleRemoveLink = useCallback(async (id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id))
    try {
      await deleteLink(id)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const handleEdit = useCallback(async (id: string, html: string) => {
    const text = html.trim()
    if (!text) {
      setTasks((prev) => prev.filter((t) => t.id !== id))
      try {
        await deleteTask(id)
      } catch (e) {
        setError(String(e))
      }
      return
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)))
    try {
      await updateTask(id, { text })
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const handleCheckToggle = useCallback(
    async (task: Task, index: number, checked: boolean) => {
      const text = toggleCheckboxInHtml(task.text, index, checked)
      const { total, checked: count } = countCheckboxes(text)
      const done = total > 0 && count === total
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, text, done } : t)))
      try {
        await updateTask(task.id, { text, done })
      } catch (e) {
        setError(String(e))
      }
    },
    [],
  )

  const handleDropTask = useCallback(
    async (taskId: string, targetIso: string, index: number) => {
      const dragged = tasks.find((t) => t.id === taskId)
      if (!dragged) return
      const dayOpen = tasks
        .filter((t) => t.date === targetIso && !t.done && t.id !== taskId)
        .sort((a, b) => a.order - b.order)
      dayOpen.splice(Math.min(index, dayOpen.length), 0, dragged)
      const updates = dayOpen.map((t, i) => ({ id: t.id, date: targetIso, order: (i + 1) * 1000 }))
      const ids = new Set(updates.map((u) => u.id))
      setTasks((prev) =>
        prev.map((t) => {
          const u = ids.has(t.id) ? updates.find((x) => x.id === t.id) : undefined
          return u ? { ...t, date: u.date, order: u.order } : t
        }),
      )
      try {
        await batchUpdate(updates)
      } catch (e) {
        setError(String(e))
      }
    },
    [tasks],
  )

  const collectTaskTree = useCallback(
    (id: string) => {
      const byParent = new Map<string, string[]>()
      for (const t of tasks) {
        const p = t.parentId ?? ''
        if (!p) continue
        const arr = byParent.get(p) ?? []
        arr.push(t.id)
        byParent.set(p, arr)
      }
      const ids = new Set([id])
      const stack = [id]
      while (stack.length > 0) {
        const cur = stack.pop()!
        for (const c of byParent.get(cur) ?? []) {
          if (!ids.has(c)) {
            ids.add(c)
            stack.push(c)
          }
        }
      }
      return ids
    },
    [tasks],
  )

  const handleDeleteTree = useCallback(
    async (id: string) => {
      const ids = collectTaskTree(id)
      setTasks((prev) => prev.filter((t) => !ids.has(t.id)))
      setLinks((prev) => prev.filter((l) => !ids.has(l.from) && !ids.has(l.to)))
      try {
        await deleteTask(id)
      } catch (e) {
        setError(String(e))
      }
    },
    [collectTaskTree],
  )

  const handleGanttCreate = useCallback(
    async (text: string, start: string, end: string, parentId: string | null, progress: number): Promise<Task> => {
      try {
        const task = await createTask(text, start, { startDate: start, endDate: end, parentId, progress })
        setTasks((prev) => [...prev, task])
        return task
      } catch (e) {
        setError(String(e))
        throw e
      }
    },
    [],
  )

  const handleGanttUpdate = useCallback(
    (id: string, patch: Partial<Pick<Task, 'text' | 'startDate' | 'endDate' | 'progress' | 'parentId'>>) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      void updateTask(id, patch).catch((e) => setError(String(e)))
    },
    [],
  )

  const handleGanttBatch = useCallback(
    async (items: BatchUpdate[]) => {
      const byId = new Map(items.map((i) => [i.id, i]))
      setTasks((prev) =>
        prev.map((t) => {
          const u = byId.get(t.id)
          if (!u) return t
          return {
            ...t,
            ...(u.date !== undefined ? { date: u.date } : {}),
            ...(u.order !== undefined ? { order: u.order } : {}),
            ...(u.startDate !== undefined ? { startDate: u.startDate } : {}),
            ...(u.endDate !== undefined ? { endDate: u.endDate } : {}),
            ...(u.progress !== undefined ? { progress: u.progress } : {}),
          }
        }),
      )
      try {
        await batchUpdate(items)
      } catch (e) {
        setError(String(e))
      }
    },
    [],
  )

  const handleEditorSave = (task: Task, html: string, openNew: boolean) => {
    setEditingId(null)
    void handleEdit(task.id, html)
    if (openNew) {
      const idx = days.findIndex((d) => toISODate(d) === task.date)
      if (idx >= 0) setNewRequest({ dayIndex: idx, ts: Date.now() })
    }
  }

  const goToday = () => setCenterIso(toISODate(new Date()))

  const goPrev = () => setCenterIso(toISODate(addDays(center, -numDays)))
  const goNext = () => setCenterIso(toISODate(addDays(center, numDays)))
  const handlePickDate = (iso: string) => setCenterIso(iso)

  const handleNumDays = (n: number) => {
    setNumDays(n)
    setColWidths(loadWidths(n))
    setNav({ day: -1, taskId: null })
    setSelectedSet(new Set())
  }

  const handleResize = (index: number, width: number) => {
    setColWidths((prev) => prev.map((w, i) => (i === index ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)) : w)))
  }

  const handleColumnColor = useCallback(async (iso: string, color: string | null) => {
    setColumnColors((prev) => {
      const next = { ...prev }
      if (color) next[iso] = color
      else delete next[iso]
      return next
    })
    try {
      if (color) await apiSetColumnColor(iso, color)
      else await apiClearColumnColor(iso)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const handleUpdateStyle = useCallback(async (id: string, style: CardStyle | null) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, style: style ?? undefined } : t)))
    try {
      await updateTask(id, { style })
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const handleUpdateTags = useCallback(async (id: string, nextTags: string[]) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, tags: nextTags } : t)))
    try {
      await updateTask(id, { tags: nextTags })
    } catch (e) {
      setError(String(e))
    }
    const merged = new Set(tags)
    for (const tg of nextTags) merged.add(tg)
    setTags([...merged].sort())
  }, [tags])

  const toggleTagFilter = useCallback((tag: string) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }, [])

  const handleAddTag = useCallback(async (name: string) => {
    try {
      const list = await createTag(name)
      setTags(list)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const handleRenameTag = useCallback(async (oldName: string, name: string) => {
    try {
      const list = await apiRenameTag(oldName, name)
      setTags(list)
      setTasks((prev) =>
        prev.map((t) =>
          (t.tags ?? []).includes(oldName)
            ? {
                ...t,
                tags: (t.tags ?? []).filter((tg) => tg !== oldName).concat(t.tags?.includes(name) ? [] : [name]),
              }
            : t,
        ),
      )
      setActiveTags((prev) => prev.map((t) => (t === oldName ? name : t)))
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const handleDeleteTag = useCallback(async (name: string) => {
    try {
      const list = await apiDeleteTag(name)
      setTags(list)
      setTasks((prev) => prev.map((t) => ({ ...t, tags: (t.tags ?? []).filter((tg) => tg !== name) })))
      setActiveTags((prev) => prev.filter((t) => t !== name))
    } catch (e) {
      setError(String(e))
    }
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedSet((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedSet(new Set()), [])

  const marqueeContainer = view === 'week' ? weekNode : view === 'rows' ? rowsNode : view === 'list' ? listNode : null
  const marquee = useMarqueeSelect(
    marqueeContainer,
    useCallback((ids: string[]) => setSelectedSet(new Set(ids)), []),
  )

  const copySelection = useCallback(async () => {
    const ids = [...selectedSet]
    if (ids.length === 0) return
    const selected = ids.map((id) => tasks.find((t) => t.id === id)).filter((t): t is Task => !!t)
    if (selected.length === 0) return
    const byDate = new Map<string, Task[]>()
    for (const t of selected) {
      const arr = byDate.get(t.date)
      if (arr) arr.push(t)
      else byDate.set(t.date, [t])
    }
    const lines: string[] = []
    for (const [iso, list] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(formatDayHeader(new Date(`${iso}T12:00:00`)))
      for (const t of list) lines.push(clipboardText(t.text))
      lines.push('')
    }
    const text = lines.join('\n').trimEnd()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
  }, [selectedSet, tasks])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [contenteditable="true"]')) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        if (selectedSet.size === 0) return
        e.preventDefault()
        void copySelection()
      } else if (e.key === 'Escape') {
        if (selectedSet.size > 0) setSelectedSet(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedSet, copySelection])

  const applyStyleToSelected = useCallback(
    (patch: (style: CardStyle | undefined) => CardStyle) => {
      const ids = [...selectedSet]
      if (ids.length === 0) return
      setTasks((prev) =>
        prev.map((t) => (ids.includes(t.id) ? { ...t, style: patch(t.style) } : t)),
      )
      for (const id of ids) {
        const t = tasks.find((x) => x.id === id)
        if (!t) continue
        void updateTask(id, { style: patch(t.style) }).catch((e) => setError(String(e)))
      }
    },
    [selectedSet, tasks],
  )

  const applyScriptToSelected = useCallback(() => {
    const ids = [...selectedSet]
    const allScript = ids.every((id) => tasks.find((t) => t.id === id)?.style?.font === 'script')
    applyStyleToSelected((s) => ({ ...s, font: allScript ? null : 'script' }))
  }, [applyStyleToSelected, selectedSet, tasks])

  const applyFillToSelected = useCallback(
    (color: string) => applyStyleToSelected((s) => ({ ...s, bg: color })),
    [applyStyleToSelected],
  )

  const toggleDoneSelected = useCallback(async () => {
    for (const id of selectedSet) {
      const t = tasks.find((x) => x.id === id)
      if (!t) continue
      setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, done: !t.done } : x)))
      try {
        await updateTask(id, { done: !t.done })
      } catch (e) {
        setError(String(e))
      }
    }
  }, [selectedSet, tasks])

  const deleteSelected = useCallback(async () => {
    const ids = [...selectedSet]
    setSelectedSet(new Set())
    for (const id of ids) await handleDelete(id)
  }, [selectedSet, handleDelete])

  const handleCardPointerDown = useCallback(
    (e: React.PointerEvent, task: Task) => {
      if (e.button !== 0 || task.done) return
      const t = e.target as HTMLElement
      if (t.closest('button, input, a, .conn-handle, .task-del, .task-check, .task-editor')) return
      const el = e.currentTarget as HTMLElement
      const startX = e.clientX
      const startY = e.clientY
      cardDragRef.current = { taskId: task.id, el, startX, startY, dragging: false }

      const onMove = (ev: PointerEvent) => {
        const d = cardDragRef.current
        if (!d) return
        const dx = ev.clientX - d.startX
        const dy = ev.clientY - d.startY
        if (!d.dragging && Math.hypot(dx, dy) < 5) return
        if (!d.dragging) {
          d.dragging = true
          suppressClick.current = true
          d.el.style.transition = 'none'
          d.el.style.zIndex = '50'
          d.el.style.pointerEvents = 'none'
        }
        d.el.style.transform = `translate(${dx}px, ${dy}px)`
        const w = weekNode
        if (w) {
          const r = w.getBoundingClientRect()
          if (ev.clientX < r.left + 56) w.scrollLeft -= 16
          else if (ev.clientX > r.right - 56) w.scrollLeft += 16
        }
        const over = document
          .elementsFromPoint(ev.clientX, ev.clientY)
          .find((x) => (x as HTMLElement).classList?.contains('day')) as HTMLElement | null
        setCardDrag({ x: ev.clientX, y: ev.clientY, overIso: over?.dataset.date ?? null })
      }

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        const d = cardDragRef.current
        cardDragRef.current = null
        setCardDrag(null)
        if (d?.dragging) {
          d.el.style.transform = ''
          d.el.style.zIndex = ''
          d.el.style.pointerEvents = ''
          const target = document
            .elementsFromPoint(ev.clientX, ev.clientY)
            .find((x) => (x as HTMLElement).classList?.contains('day')) as HTMLElement | null
          const iso = target?.dataset.date
          if (iso) {
            const body = target.querySelector('.day-body')
            const rows = Array.from((body ?? target).querySelectorAll<HTMLElement>('.task:not(.done)')).filter(
              (r) => r.dataset.taskId !== d.taskId,
            )
            let index = rows.length
            for (let i = 0; i < rows.length; i++) {
              const r = rows[i].getBoundingClientRect()
              if (ev.clientY < r.top + r.height / 2) {
                index = i
                break
              }
            }
            void handleDropTask(d.taskId, iso, index)
          }
        }
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [weekNode, handleDropTask],
  )

  const startEdit = (task: Task) => setEditingId(task.id)
  const cancelEdit = () => setEditingId(null)

  const navigateFromEditor = (dayIndex: number, delta: number) => {
    const target = Math.min(numDays - 1, Math.max(0, dayIndex + delta))
    const list = openTasksOf(toISODate(days[target]))
    setNav({ day: target, taskId: list[0]?.id ?? null })
  }

  const activeId = editingId ?? (nav.day >= 0 ? nav.taskId : null)

  const { linkedSet, edgeSet } = useMemo(() => {
    const linked = new Set<string>()
    const edge = new Set<string>()
    if (!activeId || links.length === 0) return { linkedSet: linked, edgeSet: edge }

    const adj = new Map<string, Set<string>>()
    for (const l of links) {
      if (!adj.has(l.from)) adj.set(l.from, new Set())
      if (!adj.has(l.to)) adj.set(l.to, new Set())
      adj.get(l.from)!.add(l.to)
      adj.get(l.to)!.add(l.from)
    }
    if (!adj.has(activeId)) return { linkedSet: linked, edgeSet: edge }

    const queue = [activeId]
    linked.add(activeId)
    while (queue.length > 0) {
      const id = queue.pop()!
      for (const nb of adj.get(id) ?? []) {
        if (!linked.has(nb)) {
          linked.add(nb)
          queue.push(nb)
        }
      }
    }

    const indeg = new Map<string, number>()
    const outdeg = new Map<string, number>()
    for (const l of links) {
      outdeg.set(l.from, (outdeg.get(l.from) ?? 0) + 1)
      indeg.set(l.to, (indeg.get(l.to) ?? 0) + 1)
    }
    for (const id of linked) {
      const i = indeg.get(id) ?? 0
      const o = outdeg.get(id) ?? 0
      if (i + o > 0 && (i === 0 || o === 0)) edge.add(id)
    }
    return { linkedSet: linked, edgeSet: edge }
  }, [activeId, links])

  const runCommand = (cmd: string, value?: string) => editorApi?.run(cmd, value)
  const toolbar = (
    <FormatToolbar
      onCommand={runCommand}
      selectionCount={selectedSet.size}
      onApplyScript={applyScriptToSelected}
      onApplyFill={applyFillToSelected}
      onToggleDoneSelected={() => void toggleDoneSelected()}
      onDeleteSelected={() => void deleteSelected()}
      onClearSelection={clearSelection}
      onCopy={() => void copySelection()}
      disabled={view === 'gantt'}
    />
  )

  const marqueeStyle =
    marquee
      ? {
          left: marquee.w >= 0 ? marquee.x : marquee.x + marquee.w,
          top: marquee.h >= 0 ? marquee.y : marquee.y + marquee.h,
          width: Math.abs(marquee.w),
          height: Math.abs(marquee.h),
        }
      : undefined

  return (
    <ArrowsProvider
      weekNode={weekNode}
      links={links}
      onCreate={handleCreateLink}
      onUpdate={handleUpdateLink}
      onRemove={handleRemoveLink}
    >
      {!authChecked ? (
        <div className="login-screen">
          <div className="status">Проверка сессии…</div>
        </div>
      ) : !user ? (
        <LoginScreen onLogin={handleLogin} onRegister={handleRegister} />
      ) : (
        <div className="app">
          <WeekStrip
            days={days}
            centerDate={center}
            toolbar={toolbar}
            userLogin={user.login}
            onLogout={() => void handleLogout()}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
            onPickDate={handlePickDate}
            view={view}
            onViewChange={setView}
            numDays={numDays}
            onNumDays={handleNumDays}
            filterType={filterType}
            onFilterType={setFilterType}
          />

          {loading && <div className="status">Загрузка…</div>}
          {!loading && error && <div className="status error">{error}</div>}

          {!loading && view === 'gantt' && (
            <GanttView
              tasks={tasks}
              links={links}
              onCreateTask={handleGanttCreate}
              onUpdateTask={handleGanttUpdate}
              onBatchUpdate={handleGanttBatch}
              onDeleteTask={(id) => void handleDeleteTree(id)}
              onCreateLink={handleCreateLink}
              onDeleteLink={handleRemoveLink}
            />
          )}

          {!loading && (view === 'week' || view === 'rows' || view === 'list') && (
            <>
              <FolderBar
                folders={folders}
                selected={selectedFolder}
                onSelect={setSelectedFolder}
                onCreate={handleCreateFolder}
                onRename={handleRenameFolder}
                onDelete={handleDeleteFolder}
              />
              <TagBar
              tags={tags}
              activeTags={activeTags}
              onToggleFilter={toggleTagFilter}
              onAdd={handleAddTag}
              onRename={handleRenameTag}
              onDelete={handleDeleteTag}
            />
            {view === 'week' && (
              <>
                <div className="week" style={{ ['--day-count' as string]: numDays } as React.CSSProperties} ref={setWeekNode}>
                  {days.map((day, idx) => {
                    const iso = toISODate(day)
                    return (
                      <DayColumn
                        key={iso}
                        dayIndex={idx}
                        date={day}
                        tasks={openTasksOf(iso)}
                        doneTasks={doneByIso[iso] ?? []}
                        spanNotes={spanNotesForDay(iso)}
                        isToday={isToday(iso)}
                        isPast={isPast(iso)}
                        isWeekend={day.getDay() === 0 || day.getDay() === 6}
                        isDimmed={day.getMonth() !== weekMonth}
                        color={columnColors[iso] ?? null}
                        dayWidth={colWidths[idx]}
                        selected={nav.day === idx}
                        selectedTaskId={nav.day === idx ? nav.taskId : null}
                        newRequest={newRequest}
                        editingId={editingId}
                        linkedSet={linkedSet}
                        edgeSet={edgeSet}
                        selectedSet={selectedSet}
                        isDragTarget={cardDrag?.overIso === iso}
                        onToggleSelect={toggleSelect}
                        onCardPointerDown={handleCardPointerDown}
                        onAdd={handleAdd}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                        onCheckToggle={handleCheckToggle}
                        onUpdateStyle={handleUpdateStyle}
                        onDropTask={handleDropTask}
                        allTags={tags}
                        onUpdateTags={handleUpdateTags}
                        folders={folders}
                        onAssignFolder={handleAssignFolder}
                        onFocusDay={(dayIdx, taskId) => setNav({ day: dayIdx, taskId })}
                        onStartEdit={startEdit}
                        onCancelEdit={cancelEdit}
                        onEditorSave={handleEditorSave}
                        onRegisterEditor={setEditorApi}
                        onNavigateDay={navigateFromEditor}
                        onResize={(w) => handleResize(idx, w)}
                        onPickColor={(color) => handleColumnColor(iso, color)}
                      />
                    )
                  })}
                  <ArrowsLayer />
                  {marquee && <div className="marquee" style={marqueeStyle} />}
                </div>
              </>
            )}
            {view === 'rows' && (
              <RowsView
                days={days}
                openByIso={openByIso}
                doneByIso={doneByIso}
                colors={columnColors}
                marquee={marquee}
                newRequest={newRequest}
                editingId={editingId}
                linkedSet={linkedSet}
                edgeSet={edgeSet}
                selectedSet={selectedSet}
                onToggleSelect={toggleSelect}
                onCardPointerDown={handleCardPointerDown}
                onAdd={handleAdd}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onCheckToggle={handleCheckToggle}
                onUpdateStyle={handleUpdateStyle}
                allTags={tags}
                onUpdateTags={handleUpdateTags}
                folders={folders}
                onAssignFolder={handleAssignFolder}
                onStartEdit={startEdit}
                onCancelEdit={cancelEdit}
                onEditorSave={handleEditorSave}
                onRegisterEditor={setEditorApi}
                onNavigateDay={navigateFromEditor}
                containerRef={setRowsNode}
              />
            )}
            {view === 'list' && (
              <ListView
                openByIso={openByIso}
                doneByIso={doneByIso}
                marquee={marquee}
                editingId={editingId}
                linkedSet={linkedSet}
                edgeSet={edgeSet}
                selectedSet={selectedSet}
                onToggleSelect={toggleSelect}
                onCardPointerDown={handleCardPointerDown}
                onAdd={handleAdd}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onCheckToggle={handleCheckToggle}
                onUpdateStyle={handleUpdateStyle}
                allTags={tags}
                onUpdateTags={handleUpdateTags}
                folders={folders}
                onAssignFolder={handleAssignFolder}
                onStartEdit={startEdit}
                onCancelEdit={cancelEdit}
                onEditorSave={handleEditorSave}
                onRegisterEditor={setEditorApi}
                containerRef={setListNode}
              />
            )}
          </>
        )}
        </div>
      )}
    </ArrowsProvider>
  )
}

export default App
