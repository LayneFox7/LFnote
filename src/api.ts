import type { CardStyle, Folder, Link, Task, User } from './types'

const BASE = '/api'

const authFetch = (path: string, init?: RequestInit) => fetch(path, { ...init, credentials: 'include' })

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export async function apiRegister(login: string, password: string): Promise<User> {
  const data = await json<{ user: User }>(
    await authFetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    }),
  )
  return data.user
}

export async function apiLogin(login: string, password: string): Promise<User> {
  const data = await json<{ user: User }>(
    await authFetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    }),
  )
  return data.user
}

export async function apiLogout(): Promise<void> {
  await authFetch(`${BASE}/auth/logout`, { method: 'POST' })
}

export async function apiMe(): Promise<User | null> {
  const res = await authFetch(`${BASE}/auth/me`)
  if (res.status === 401) return null
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()).user as User
}

export async function fetchFolders(): Promise<Folder[]> {
  const data = await json<{ folders: Folder[] }>(await authFetch(`${BASE}/folders`))
  return data.folders
}

export async function createFolder(name: string): Promise<Folder> {
  const data = await json<{ folder: Folder }>(
    await authFetch(`${BASE}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  )
  return data.folder
}

export async function renameFolder(id: number, name: string): Promise<Folder> {
  const data = await json<{ folder: Folder }>(
    await authFetch(`${BASE}/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  )
  return data.folder
}

export async function deleteFolder(id: number): Promise<void> {
  await authFetch(`${BASE}/folders/${id}`, { method: 'DELETE' })
}

export async function fetchTasks(): Promise<Task[]> {
  const data = await json<{ tasks: Task[] }>(await authFetch(`${BASE}/tasks`))
  return data.tasks
}

export interface CreateTaskOptions {
  startDate?: string
  endDate?: string
  parentId?: string | null
  progress?: number
  folderId?: number | null
  type?: 'task' | 'note'
}

export async function createTask(text: string, date: string, options?: CreateTaskOptions): Promise<Task> {
  const { type, ...rest } = options ?? {}
  const data = await json<{ task: Task }>(
    await authFetch(`${BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, date, type: type ?? 'task', ...rest }),
    }),
  )
  return data.task
}

export async function updateTask(
  id: string,
  patch: Partial<Omit<Task, 'style'>> & { style?: CardStyle | null },
): Promise<Task> {
  const data = await json<{ task: Task }>(
    await authFetch(`${BASE}/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
  return data.task
}

export async function deleteTask(id: string): Promise<void> {
  await authFetch(`${BASE}/tasks/${id}`, { method: 'DELETE' })
}

export interface BatchUpdate {
  id: string
  date?: string
  order?: number
  startDate?: string | null
  endDate?: string | null
  progress?: number
  parentId?: string | null
}

export async function batchUpdate(tasks: BatchUpdate[]): Promise<void> {
  await authFetch(`${BASE}/tasks/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks }),
  })
}

export async function fetchLinks(): Promise<Link[]> {
  const data = await json<{ links: Link[] }>(await authFetch(`${BASE}/links`))
  return data.links
}

export async function createLink(from: string, to: string): Promise<Link> {
  const data = await json<{ link: Link }>(
    await authFetch(`${BASE}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    }),
  )
  return data.link
}

export async function updateLink(id: string, patch: Partial<Pick<Link, 'from' | 'to' | 'style'>>): Promise<Link> {
  const data = await json<{ link: Link }>(
    await authFetch(`${BASE}/links/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
  return data.link
}

export async function deleteLink(id: string): Promise<void> {
  await authFetch(`${BASE}/links/${id}`, { method: 'DELETE' })
}

export async function fetchColumns(): Promise<Record<string, string>> {
  const data = await json<{ columns: Record<string, string> }>(await authFetch(`${BASE}/columns`))
  return data.columns
}

export async function setColumnColor(date: string, color: string): Promise<void> {
  await json(await authFetch(`${BASE}/columns/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ color }),
  }))
}

export async function clearColumnColor(date: string): Promise<void> {
  await authFetch(`${BASE}/columns/${date}`, { method: 'DELETE' })
}

export async function fetchTags(): Promise<string[]> {
  const data = await json<{ tags: string[] }>(await authFetch(`${BASE}/tags`))
  return data.tags
}

export async function createTag(name: string): Promise<string[]> {
  const data = await json<{ tags: string[] }>(
    await authFetch(`${BASE}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  )
  return data.tags
}

export async function renameTag(oldName: string, name: string): Promise<string[]> {
  const data = await json<{ tags: string[] }>(
    await authFetch(`${BASE}/tags/${encodeURIComponent(oldName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  )
  return data.tags
}

export async function deleteTag(name: string): Promise<string[]> {
  const data = await json<{ tags: string[] }>(await authFetch(`${BASE}/tags/${encodeURIComponent(name)}`, { method: 'DELETE' }))
  return data.tags
}
