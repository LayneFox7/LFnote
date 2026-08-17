import express from 'express'
import cookieParser from 'cookie-parser'
import swaggerUi from 'swagger-ui-express'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query, rowToTask, rowToLink, rowToFolder, getUserTasks } from './db.js'
import {
  SESSION_COOKIE,
  validateCredentials,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getUserByLogin,
  getUserBySession,
  requireAuth,
} from './auth.js'
import { openapi } from './openapi.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001
const IS_PROD = process.env.NODE_ENV === 'production'

if (IS_PROD) app.set('trust proxy', 1)

app.use(express.json())
app.use(cookieParser())

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: IS_PROD,
  maxAge: 30 * 24 * 60 * 60 * 1000,
}

const today = () => new Date().toISOString().slice(0, 10)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function assertValidParent(userId, taskId, parentId) {
  if (parentId === null || parentId === undefined) return null
  const pid = String(parentId)
  if (pid === taskId) throw new Error('task cannot be its own parent')
  const { rows } = await query(`SELECT parent_id FROM tasks WHERE id = $1 AND user_id = $2`, [pid, userId])
  if (rows.length === 0) throw new Error('parent task not found')
  let cur = rows[0].parent_id
  const seen = new Set([pid])
  while (cur) {
    if (seen.has(cur)) throw new Error('task parent cycle detected')
    if (cur === taskId) throw new Error('task cannot be moved under its own descendant')
    seen.add(cur)
    const r = await query(`SELECT parent_id FROM tasks WHERE id = $1 AND user_id = $2`, [cur, userId])
    if (r.rows.length === 0) break
    cur = r.rows[0].parent_id
  }
  return pid
}

const parseGanttDates = (body) => {
  const { startDate, endDate } = body ?? {}
  let s = null
  let e = null
  if (startDate !== undefined && startDate !== null) {
    if (typeof startDate !== 'string' || !DATE_RE.test(startDate)) throw new Error('startDate must be YYYY-MM-DD')
    s = startDate
  }
  if (endDate !== undefined && endDate !== null) {
    if (typeof endDate !== 'string' || !DATE_RE.test(endDate)) throw new Error('endDate must be YYYY-MM-DD')
    e = endDate
  }
  if (s && e && e < s) throw new Error('endDate must be >= startDate')
  return { s, e }
}

const parseProgress = (value) => {
  if (value === undefined || value === null) return 0
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error('progress must be an integer 0..100')
  return n
}

async function rollover(userId) {
  await query(`UPDATE tasks SET date = $1 WHERE user_id = $2 AND NOT done AND date < $1`, [today(), userId])
}

async function syncTaskTags(taskId, userId, names) {
  const cleaned = []
  for (const tg of names) {
    if (typeof tg !== 'string') throw new Error('tags must be strings')
    const name = tg.trim()
    if (!name || name.length > 40) throw new Error('invalid tag name')
    if (!cleaned.includes(name)) cleaned.push(name)
  }
  await query(`DELETE FROM task_tags WHERE task_id = $1`, [taskId])
  for (const name of cleaned) {
    await query(
      `INSERT INTO tags (user_id, name) VALUES ($1, $2) ON CONFLICT (user_id, name) DO NOTHING`,
      [userId, name],
    )
    const { rows } = await query(`SELECT id FROM tags WHERE user_id = $1 AND name = $2`, [userId, name])
    if (rows[0]) await query(`INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [taskId, rows[0].id])
  }
}

/* ------------------------------- АВТОРИЗАЦИЯ ------------------------------- */

app.post('/api/auth/register', async (req, res) => {
  const { login, password } = req.body ?? {}
  const err = validateCredentials(login, password)
  if (err) return res.status(400).json({ error: err })
  if (await getUserByLogin(login)) return res.status(409).json({ error: 'Логин уже занят' })
  const { rows } = await query(`INSERT INTO users (login, password_hash) VALUES ($1, $2) RETURNING id, login, created_at`, [
    login,
    hashPassword(password),
  ])
  const token = await createSession(rows[0].id)
  res.cookie(SESSION_COOKIE, token, COOKIE_OPTS)
  res.status(201).json({ user: { id: rows[0].id, login: rows[0].login } })
})

app.post('/api/auth/login', async (req, res) => {
  const { login, password } = req.body ?? {}
  if (typeof login !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'login and password required' })
  }
  const user = await getUserByLogin(login)
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' })
  }
  const token = await createSession(user.id)
  res.cookie(SESSION_COOKIE, token, COOKIE_OPTS)
  res.json({ user: { id: user.id, login: user.login } })
})

app.post('/api/auth/logout', async (req, res) => {
  await destroySession(req.cookies?.[SESSION_COOKIE] ?? null)
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: IS_PROD })
  res.json({ ok: true })
})

app.get('/api/auth/me', async (req, res) => {
  const user = await getUserBySession(req.cookies?.[SESSION_COOKIE] ?? null)
  if (!user) return res.status(401).json({ error: 'Требуется авторизация' })
  res.json({ user })
})

/* --------------------------------- ПАПКИ ---------------------------------- */

const FOLDER_LIMIT = 10
const FOLDER_NAME_RE = /^.{1,40}$/s

async function getFolders(userId) {
  const { rows } = await query(`SELECT * FROM folders WHERE user_id = $1 ORDER BY position, id`, [userId])
  return rows.map(rowToFolder)
}

app.get('/api/folders', requireAuth, async (req, res) => {
  res.json({ folders: await getFolders(req.user.id) })
})

app.post('/api/folders', requireAuth, async (req, res) => {
  const { name } = req.body ?? {}
  if (typeof name !== 'string' || !name.trim() || !FOLDER_NAME_RE.test(name.trim())) {
    return res.status(400).json({ error: 'Название папки: 1–40 символов' })
  }
  const value = name.trim()
  const count = (await query(`SELECT count(*)::int AS n FROM folders WHERE user_id = $1`, [req.user.id])).rows[0].n
  if (count >= FOLDER_LIMIT) return res.status(400).json({ error: `Максимум ${FOLDER_LIMIT} папок` })
  const { rows } = await query(
    `INSERT INTO folders (user_id, name, position) VALUES ($1, $2, $3) RETURNING *`,
    [req.user.id, value, count],
  )
  res.status(201).json({ folder: rowToFolder(rows[0]) })
})

app.patch('/api/folders/:id', requireAuth, async (req, res) => {
  const { name } = req.body ?? {}
  if (typeof name !== 'string' || !name.trim() || !FOLDER_NAME_RE.test(name.trim())) {
    return res.status(400).json({ error: 'Название папки: 1–40 символов' })
  }
  const value = name.trim()
  const { rows } = await query(
    `UPDATE folders SET name = $1
      WHERE id = $2 AND user_id = $3
      RETURNING *`,
    [value, Number(req.params.id), req.user.id],
  )
  if (rows.length === 0) return res.status(404).json({ error: 'not found' })
  res.json({ folder: rowToFolder(rows[0]) })
})

app.delete('/api/folders/:id', requireAuth, async (req, res) => {
  const { rows } = await query(`DELETE FROM folders WHERE id = $1 AND user_id = $2 RETURNING id`, [
    Number(req.params.id),
    req.user.id,
  ])
  if (rows.length === 0) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

/* --------------------------------- ЗАДАЧИ --------------------------------- */

app.get('/api/tasks', requireAuth, async (req, res) => {
  await rollover(req.user.id)
  res.json({ tasks: await getUserTasks(req.user.id) })
})

app.post('/api/tasks', requireAuth, async (req, res) => {
  const { text, date, folderId, type: rawType } = req.body ?? {}
  const value = typeof text === 'string' ? text.trim() : ''
  if (!value || typeof date !== 'string' || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'text and date (YYYY-MM-DD) required' })
  }
  const typeValue = rawType === 'note' ? 'note' : 'task'
  let folderIdValue = null
  if (folderId !== undefined && folderId !== null) {
    folderIdValue = Number(folderId)
    const f = await query(`SELECT id FROM folders WHERE id = $1 AND user_id = $2`, [folderIdValue, req.user.id])
    if (f.rows.length === 0) return res.status(400).json({ error: 'folder not found' })
  }
  let startDateValue = null
  let endDateValue = null
  try {
    const parsed = parseGanttDates(req.body)
    startDateValue = parsed.s
    endDateValue = parsed.e
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
  let progressValue = 0
  try {
    progressValue = parseProgress(req.body?.progress)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
  let parentIdValue = null
  if (req.body?.parentId !== undefined && req.body?.parentId !== null) {
    try {
      parentIdValue = await assertValidParent(req.user.id, null, req.body.parentId)
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }
  }
  const { rows } = await query(
    `INSERT INTO tasks (id, user_id, folder_id, text, date, start_date, end_date, parent_id, progress, order_key, type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [randomUUID(), req.user.id, folderIdValue, value, date, startDateValue, endDateValue, parentIdValue, progressValue, Date.now(), typeValue],
  )
  res.status(201).json({ task: rowToTask(rows[0]) })
})

app.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  const { rows } = await query(`SELECT * FROM tasks WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id])
  if (rows.length === 0) return res.status(404).json({ error: 'not found' })
  const task = rows[0]
  const body = req.body ?? {}

  if (typeof body.text === 'string' && body.text.trim() && body.text.trim().length <= 10000) task.text = body.text.trim()
  if (typeof body.date === 'string' && DATE_RE.test(body.date)) task.date = body.date
  if (typeof body.done === 'boolean') {
    task.done = body.done
    task.completed_at = body.done ? new Date() : null
  }
  if (body.type === 'note' || body.type === 'task') task.type = body.type
  if (typeof body.order === 'number' && Number.isFinite(body.order)) task.order_key = body.order
  if (body.folderId !== undefined) {
    if (body.folderId === null || body.folderId === '') {
      task.folder_id = null
    } else {
      const fid = Number(body.folderId)
      const f = await query(`SELECT id FROM folders WHERE id = $1 AND user_id = $2`, [fid, req.user.id])
      if (f.rows.length === 0) return res.status(400).json({ error: 'folder not found' })
      task.folder_id = fid
    }
  }
  if (body.style !== undefined && (body.style === null || (typeof body.style === 'object' && !Array.isArray(body.style)))) {
    task.style = body.style === null ? null : body.style
  }
  if (body.startDate !== undefined || body.endDate !== undefined) {
    try {
      const parsed = parseGanttDates(body)
      if (body.startDate !== undefined) task.start_date = parsed.s
      if (body.endDate !== undefined) task.end_date = parsed.e
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }
  }
  if (body.progress !== undefined) {
    try {
      task.progress = parseProgress(body.progress)
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }
  }
  if (body.parentId !== undefined) {
    if (body.parentId === null || body.parentId === '') {
      task.parent_id = null
    } else {
      try {
        task.parent_id = await assertValidParent(req.user.id, task.id, body.parentId)
      } catch (e) {
        return res.status(400).json({ error: e.message })
      }
    }
  }

  await query(
    `UPDATE tasks SET text = $1, date = $2, done = $3, completed_at = $4, order_key = $5, folder_id = $6, style = $7,
            start_date = $8, end_date = $9, parent_id = $10, progress = $11, type = $12
      WHERE id = $13 AND user_id = $14`,
    [task.text, task.date, task.done, task.completed_at, task.order_key, task.folder_id, task.style, task.start_date, task.end_date, task.parent_id, task.progress, task.type, task.id, req.user.id],
  )

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) return res.status(400).json({ error: 'tags must be an array' })
    try {
      await syncTaskTags(task.id, req.user.id, body.tags)
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }
  }
  const { rows: withTags } = await query(
    `SELECT t.*,
            COALESCE(array_agg(tg.name ORDER BY tg.name) FILTER (WHERE tg.name IS NOT NULL), '{}') AS tags
       FROM tasks t
       LEFT JOIN task_tags tt ON tt.task_id = t.id
       LEFT JOIN tags tg ON tg.id = tt.tag_id
      WHERE t.id = $1 GROUP BY t.id`,
    [task.id],
  )
  res.json({ task: rowToTask(withTags[0]) })
})

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const { rows } = await query(`DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id`, [req.params.id, req.user.id])
  if (rows.length === 0) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

app.post('/api/tasks/batch', requireAuth, async (req, res) => {
  const items = req.body?.tasks
  if (!Array.isArray(items)) return res.status(400).json({ error: 'tasks array required' })
  for (const it of items) {
    if (!it || typeof it.id !== 'string') continue
    const sets = []
    const params = [req.user.id, it.id]
    if (typeof it.date === 'string' && DATE_RE.test(it.date)) {
      params.push(it.date)
      sets.push(`date = $${params.length}`)
    }
    if (typeof it.order === 'number' && Number.isFinite(it.order)) {
      params.push(it.order)
      sets.push(`order_key = $${params.length}`)
    }
    if (it.folderId !== undefined) {
      const fid = it.folderId
      if (fid !== null && (typeof fid !== 'number' || !Number.isFinite(fid))) {
        return res.status(400).json({ error: 'folderId must be a number or null' })
      }
      if (fid !== null) {
        const f = await query(`SELECT id FROM folders WHERE id = $1 AND user_id = $2`, [fid, req.user.id])
        if (f.rows.length === 0) return res.status(400).json({ error: 'folder not found' })
      }
      params.push(fid)
      sets.push(`folder_id = $${params.length}`)
    }
    if (it.startDate !== undefined || it.endDate !== undefined) {
      let s = null
      let e = null
      try {
        const parsed = parseGanttDates(it)
        s = parsed.s
        e = parsed.e
      } catch (err) {
        return res.status(400).json({ error: err.message })
      }
      if (it.startDate !== undefined) {
        params.push(s)
        sets.push(`start_date = $${params.length}`)
      }
      if (it.endDate !== undefined) {
        params.push(e)
        sets.push(`end_date = $${params.length}`)
      }
    }
    if (it.progress !== undefined) {
      let p
      try {
        p = parseProgress(it.progress)
      } catch (err) {
        return res.status(400).json({ error: err.message })
      }
      params.push(p)
      sets.push(`progress = $${params.length}`)
    }
    if (it.parentId !== undefined) {
      let pid = null
      if (it.parentId !== null && it.parentId !== '') {
        try {
          pid = await assertValidParent(req.user.id, it.id, it.parentId)
        } catch (err) {
          return res.status(400).json({ error: err.message })
        }
      }
      params.push(pid)
      sets.push(`parent_id = $${params.length}`)
    }
    if (sets.length > 0) await query(`UPDATE tasks SET ${sets.join(', ')} WHERE user_id = $1 AND id = $2`, params)
  }
  res.json({ ok: true })
})

/* --------------------------------- ТЕГИ ----------------------------------- */

app.get('/api/tags', requireAuth, async (req, res) => {
  const { rows } = await query(`SELECT name FROM tags WHERE user_id = $1 ORDER BY name`, [req.user.id])
  res.json({ tags: rows.map((r) => r.name) })
})

app.post('/api/tags', requireAuth, async (req, res) => {
  const { name } = req.body ?? {}
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) {
    return res.status(400).json({ error: 'invalid tag name' })
  }
  const value = name.trim()
  await query(`INSERT INTO tags (user_id, name) VALUES ($1, $2) ON CONFLICT (user_id, name) DO NOTHING`, [req.user.id, value])
  const { rows } = await query(`SELECT name FROM tags WHERE user_id = $1 ORDER BY name`, [req.user.id])
  res.status(201).json({ tags: rows.map((r) => r.name) })
})

app.patch('/api/tags/:name', requireAuth, async (req, res) => {
  const { name } = req.body ?? {}
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) {
    return res.status(400).json({ error: 'invalid tag name' })
  }
  const oldName = req.params.name
  const value = name.trim()
  if (oldName === value) {
    const { rows } = await query(`SELECT name FROM tags WHERE user_id = $1 ORDER BY name`, [req.user.id])
    return res.json({ tags: rows.map((r) => r.name) })
  }
  const { rowCount } = await query(`UPDATE tags SET name = $1 WHERE user_id = $2 AND name = $3`, [value, req.user.id, oldName])
  if (rowCount === 0) return res.status(404).json({ error: 'tag not found' })
  const { rows } = await query(`SELECT name FROM tags WHERE user_id = $1 ORDER BY name`, [req.user.id])
  res.json({ tags: rows.map((r) => r.name) })
})

app.delete('/api/tags/:name', requireAuth, async (req, res) => {
  const { rowCount } = await query(`DELETE FROM tags WHERE user_id = $1 AND name = $2`, [req.user.id, req.params.name])
  if (rowCount === 0) return res.status(404).json({ error: 'tag not found' })
  const { rows } = await query(`SELECT name FROM tags WHERE user_id = $1 ORDER BY name`, [req.user.id])
  res.json({ tags: rows.map((r) => r.name) })
})

/* --------------------------------- СТРЕЛКИ --------------------------------- */

app.get('/api/links', requireAuth, async (req, res) => {
  const { rows } = await query(`SELECT * FROM links WHERE user_id = $1 ORDER BY created_at`, [req.user.id])
  res.json({ links: rows.map(rowToLink) })
})

app.post('/api/links', requireAuth, async (req, res) => {
  const { from, to } = req.body ?? {}
  if (typeof from !== 'string' || typeof to !== 'string' || !from || !to || from === to) {
    return res.status(400).json({ error: 'from and to task ids required' })
  }
  const owned = await query(
    `SELECT count(*)::int AS n FROM tasks WHERE user_id = $1 AND id IN ($2, $3)`,
    [req.user.id, from, to],
  )
  if (owned.rows[0].n !== 2) return res.status(400).json({ error: 'tasks not found' })
  const dup = await query(`SELECT id FROM links WHERE user_id = $1 AND from_id = $2 AND to_id = $3`, [req.user.id, from, to])
  if (dup.rows.length > 0) return res.status(409).json({ error: 'link already exists' })
  const { rows } = await query(
    `INSERT INTO links (id, user_id, from_id, to_id) VALUES ($1, $2, $3, $4) RETURNING *`,
    [randomUUID(), req.user.id, from, to],
  )
  res.status(201).json({ link: rowToLink(rows[0]) })
})

app.patch('/api/links/:id', requireAuth, async (req, res) => {
  const { rows } = await query(`SELECT * FROM links WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id])
  if (rows.length === 0) return res.status(404).json({ error: 'not found' })
  const link = rows[0]
  const body = req.body ?? {}
  if (typeof body.from === 'string' && body.from) link.from_id = body.from
  if (typeof body.to === 'string' && body.to) link.to_id = body.to
  if (link.from_id === link.to_id) return res.status(400).json({ error: 'self link not allowed' })
  if (body.style !== undefined && (body.style === null || (typeof body.style === 'object' && !Array.isArray(body.style)))) {
    link.style = body.style === null ? null : body.style
  }
  const owned = await query(
    `SELECT count(*)::int AS n FROM tasks WHERE user_id = $1 AND id IN ($2, $3)`,
    [req.user.id, link.from_id, link.to_id],
  )
  if (owned.rows[0].n !== 2) return res.status(400).json({ error: 'tasks not found' })
  const dup = await query(
    `SELECT id FROM links WHERE user_id = $1 AND id <> $2 AND from_id = $3 AND to_id = $4`,
    [req.user.id, link.id, link.from_id, link.to_id],
  )
  if (dup.rows.length > 0) return res.status(409).json({ error: 'duplicate link' })
  const updated = (
    await query(`UPDATE links SET from_id = $1, to_id = $2, style = $3 WHERE id = $4 RETURNING *`, [
      link.from_id,
      link.to_id,
      link.style,
      link.id,
    ])
  ).rows[0]
  res.json({ link: rowToLink(updated) })
})

app.delete('/api/links/:id', requireAuth, async (req, res) => {
  const { rows } = await query(`DELETE FROM links WHERE id = $1 AND user_id = $2 RETURNING id`, [req.params.id, req.user.id])
  if (rows.length === 0) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

/* -------------------------------- КОЛОНКИ ---------------------------------- */

app.get('/api/columns', requireAuth, async (req, res) => {
  const { rows } = await query(`SELECT date, color FROM columns WHERE user_id = $1`, [req.user.id])
  const out = {}
  for (const r of rows) out[r.date] = r.color
  res.json({ columns: out })
})

app.put('/api/columns/:date', requireAuth, async (req, res) => {
  const { date } = req.params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid date' })
  const { color } = req.body ?? {}
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(color)) {
    return res.status(400).json({ error: 'invalid color' })
  }
  await query(
    `INSERT INTO columns (user_id, date, color) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, date) DO UPDATE SET color = EXCLUDED.color`,
    [req.user.id, date, color],
  )
  res.json({ ok: true })
})

app.delete('/api/columns/:date', requireAuth, async (req, res) => {
  const { date } = req.params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid date' })
  await query(`DELETE FROM columns WHERE user_id = $1 AND date = $2`, [req.user.id, date])
  res.json({ ok: true })
})

/* --------------------------------- SWAGGER --------------------------------- */

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'LFnote API' }))
app.get('/api/openapi.json', (_req, res) => res.json(openapi))

/* ------------------------------ СТАТИКА (SPA) ------------------------------ */

const dist = join(__dirname, '..', 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(join(dist, 'index.html'))
    }
    next()
  })
}

app.listen(PORT, () => {
  console.log(`LFnote server on http://localhost:${PORT}`)
  console.log(`API docs: http://localhost:${PORT}/api/docs`)
})
