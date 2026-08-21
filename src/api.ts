import type { CardStyle, Folder, Link, Task, User } from './types'

/* ── localStorage helpers ── */

const LS = {
  get<T>(key: string, fallback: T): T {
    try { const raw = localStorage.getItem(`lfnote.${key}`); return raw ? JSON.parse(raw) : fallback }
    catch { return fallback }
  },
  set(key: string, value: unknown) { localStorage.setItem(`lfnote.${key}`, JSON.stringify(value)) },
}

function uid(): string { return crypto.randomUUID() }
let nextNumId = LS.get<number>('nextNumId', 1)
function numId(): number { return nextNumId++ }

function persistNumId() { LS.set('nextNumId', nextNumId) }

/* ── Auth (stub — always "logged in" as local user) ── */

const LOCAL_USER: User = { id: 1, login: 'local' }

export async function apiRegister(_login: string, _password: string): Promise<User> {
  LS.set('user', LOCAL_USER)
  return LOCAL_USER
}
export async function apiLogin(_login: string, _password: string): Promise<User> {
  LS.set('user', LOCAL_USER)
  return LOCAL_USER
}
export async function apiLogout(): Promise<void> { localStorage.removeItem('lfnote.user') }
export async function apiMe(): Promise<User | null> { return LS.get<User | null>('user', LOCAL_USER) }

/* ── Tasks ── */

export async function fetchTasks(): Promise<Task[]> {
  return LS.get<Task[]>('tasks', []).map(t => ({ ...t, type: (t as any).type ?? 'task' }))
}

export interface CreateTaskOptions {
  startDate?: string; endDate?: string; parentId?: string | null
  progress?: number; folderId?: number | null; type?: 'task' | 'note'
}

export async function createTask(text: string, date: string, options?: CreateTaskOptions): Promise<Task> {
  const tasks = LS.get<Task[]>('tasks', [])
  const maxOrder = tasks.filter(t => t.date === date && !t.done).reduce((m, t) => Math.max(m, t.order), 0)
  const task: Task = {
    id: uid(), text, date, done: false,
    type: options?.type ?? 'task',
    createdAt: new Date().toISOString(), completedAt: null,
    order: maxOrder + 1000,
    startDate: options?.startDate ?? null,
    endDate: options?.endDate ?? null,
    parentId: options?.parentId ?? null,
    progress: options?.progress ?? 0,
    folderId: options?.folderId ?? null,
  }
  tasks.push(task)
  LS.set('tasks', tasks)
  return task
}

export async function updateTask(id: string, patch: Partial<Omit<Task, 'style'>> & { style?: CardStyle | null }): Promise<Task> {
  const tasks = LS.get<Task[]>('tasks', [])
  const idx = tasks.findIndex(t => t.id === id)
  if (idx < 0) throw new Error('Task not found')
  const t = tasks[idx]
  const next = { ...t, ...patch, style: patch.style === null ? undefined : patch.style !== undefined ? patch.style : t.style }
  tasks[idx] = next
  LS.set('tasks', tasks)
  return next
}

export async function deleteTask(id: string): Promise<void> {
  LS.set('tasks', LS.get<Task[]>('tasks', []).filter(t => t.id !== id))
}

export interface BatchUpdate {
  id: string; date?: string; order?: number
  startDate?: string | null; endDate?: string | null
  progress?: number; parentId?: string | null
}

export async function batchUpdate(items: BatchUpdate[]): Promise<void> {
  const tasks = LS.get<Task[]>('tasks', [])
  const byId = new Map(items.map(i => [i.id, i]))
  for (let i = 0; i < tasks.length; i++) {
    const u = byId.get(tasks[i].id)
    if (u) {
      tasks[i] = {
        ...tasks[i],
        ...(u.date !== undefined ? { date: u.date } : {}),
        ...(u.order !== undefined ? { order: u.order } : {}),
        ...(u.startDate !== undefined ? { startDate: u.startDate } : {}),
        ...(u.endDate !== undefined ? { endDate: u.endDate } : {}),
        ...(u.progress !== undefined ? { progress: u.progress } : {}),
        ...(u.parentId !== undefined ? { parentId: u.parentId } : {}),
      }
    }
  }
  LS.set('tasks', tasks)
}

/* ── Links ── */

export async function fetchLinks(): Promise<Link[]> { return LS.get<Link[]>('links', []) }

export async function createLink(from: string, to: string): Promise<Link> {
  const links = LS.get<Link[]>('links', [])
  const link: Link = { id: uid(), from, to, createdAt: new Date().toISOString() }
  links.push(link)
  LS.set('links', links)
  return link
}

export async function updateLink(id: string, p: Partial<Pick<Link, 'from' | 'to' | 'style'>>): Promise<Link> {
  const links = LS.get<Link[]>('links', [])
  const idx = links.findIndex(l => l.id === id)
  if (idx < 0) throw new Error('Link not found')
  links[idx] = { ...links[idx], ...p }
  LS.set('links', links)
  return links[idx]
}

export async function deleteLink(id: string): Promise<void> {
  LS.set('links', LS.get<Link[]>('links', []).filter(l => l.id !== id))
}

/* ── Folders ── */

export async function fetchFolders(): Promise<Folder[]> { return LS.get<Folder[]>('folders', []) }

export async function createFolder(name: string): Promise<Folder> {
  const folders = LS.get<Folder[]>('folders', [])
  const folder: Folder = { id: numId(), name, position: folders.length }
  folders.push(folder)
  LS.set('folders', folders)
  persistNumId()
  return folder
}

export async function renameFolder(id: number, name: string): Promise<Folder> {
  const folders = LS.get<Folder[]>('folders', [])
  const idx = folders.findIndex(f => f.id === id)
  if (idx < 0) throw new Error('Folder not found')
  folders[idx] = { ...folders[idx], name }
  LS.set('folders', folders)
  return folders[idx]
}

export async function deleteFolder(id: number): Promise<void> {
  LS.set('folders', LS.get<Folder[]>('folders', []).filter(f => f.id !== id))
}

/* ── Columns ── */

export async function fetchColumns(): Promise<Record<string, string>> {
  return LS.get<Record<string, string>>('columns', {})
}

export async function setColumnColor(date: string, color: string): Promise<void> {
  const cols = LS.get<Record<string, string>>('columns', {})
  cols[date] = color
  LS.set('columns', cols)
}

export async function clearColumnColor(date: string): Promise<void> {
  const cols = LS.get<Record<string, string>>('columns', {})
  delete cols[date]
  LS.set('columns', cols)
}

/* ── Tags ── */

export async function fetchTags(): Promise<string[]> { return LS.get<string[]>('tags', []) }

export async function createTag(name: string): Promise<string[]> {
  const tags = LS.get<string[]>('tags', [])
  if (!tags.includes(name)) tags.push(name)
  LS.set('tags', tags)
  return tags
}

export async function renameTag(oldName: string, name: string): Promise<string[]> {
  let tags = LS.get<string[]>('tags', [])
  tags = tags.map(t => t === oldName ? name : t)
  LS.set('tags', tags)
  const tasks = LS.get<Task[]>('tasks', [])
  for (const t of tasks) {
    if (t.tags?.includes(oldName)) {
      t.tags = t.tags.filter(tg => tg !== oldName)
      if (!t.tags.includes(name)) t.tags.push(name)
    }
  }
  LS.set('tasks', tasks)
  return tags
}

export async function deleteTag(name: string): Promise<string[]> {
  let tags = LS.get<string[]>('tags', [])
  tags = tags.filter(t => t !== name)
  LS.set('tags', tags)
  const tasks = LS.get<Task[]>('tasks', [])
  for (const t of tasks) {
    if (t.tags) t.tags = t.tags.filter(tg => tg !== name)
  }
  LS.set('tasks', tasks)
  return tags
}

/* ── Admin ── */

export interface AdminStats {
  tasks: number; doneTasks: number; notes: number; links: number
  tags: number; folders: number; activeSessions: number; createdAt: string | null
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const tasks = LS.get<Task[]>('tasks', [])
  return {
    tasks: tasks.filter(t => !t.done).length,
    doneTasks: tasks.filter(t => t.done).length,
    notes: tasks.filter(t => t.type === 'note').length,
    links: LS.get<Link[]>('links', []).length,
    tags: LS.get<string[]>('tags', []).length,
    folders: LS.get<Folder[]>('folders', []).length,
    activeSessions: 1,
    createdAt: null,
  }
}
