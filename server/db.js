import pg from 'pg'

const { Pool } = pg

function makeConfig(ssl) {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
    }
  }
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'lfn',
    password: process.env.PGPASSWORD || 'lfn_dev_2026',
    database: process.env.PGDATABASE || 'lfnote',
    connectionTimeoutMillis: 10000,
  }
}

const errMsg = (err) => {
  if (Array.isArray(err?.errors)) return err.errors.map((x) => x?.message).filter(Boolean).join('; ')
  return err?.message ?? String(err)
}

async function createPool() {
  const maxAttempts = 6
  let ssl = process.env.PGSSL !== 'false'
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const p = new Pool(makeConfig(ssl))
      await p.query('SELECT 1')
      return p
    } catch (err) {
      const sslError = /ssl|tls|pem|protocol/i.test(errMsg(err))
      if (process.env.DATABASE_URL && ssl && sslError) {
        ssl = false
        attempt--
        continue
      }
      console.error(`[db] Подключение к PostgreSQL не удалось (попытка ${attempt}/${maxAttempts}):`, errMsg(err))
      if (attempt === maxAttempts) {
        console.error('[db] DATABASE_URL задан:', process.env.DATABASE_URL ? 'да' : 'нет')
        throw err
      }
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

export const pool = createPool()

export const query = (text, params) => pool.then((p) => p.query(text, params))
export const closePool = () => pool.then((p) => p.end())

export const rowToTask = (r) => ({
  id: r.id,
  text: r.text,
  date: r.date,
  type: r.type ?? 'task',
  startDate: r.start_date ?? null,
  endDate: r.end_date ?? null,
  parentId: r.parent_id ?? null,
  progress: r.progress ?? 0,
  done: r.done,
  createdAt: r.created_at ? r.created_at.toISOString() : null,
  completedAt: r.completed_at ? r.completed_at.toISOString() : null,
  order: r.order_key,
  style: r.style ?? undefined,
  tags: r.tags ?? [],
  folderId: r.folder_id ?? null,
})

export const rowToLink = (r) => ({
  id: r.id,
  from: r.from_id,
  to: r.to_id,
  style: r.style ?? undefined,
  createdAt: r.created_at ? r.created_at.toISOString() : null,
})

export const rowToFolder = (r) => ({
  id: r.id,
  name: r.name,
  position: r.position,
})

export async function getUserTasks(userId) {
  const { rows } = await query(
    `SELECT t.*,
            COALESCE(array_agg(tg.name ORDER BY tg.name) FILTER (WHERE tg.name IS NOT NULL), '{}') AS tags
       FROM tasks t
       LEFT JOIN task_tags tt ON tt.task_id = t.id
       LEFT JOIN tags tg ON tg.id = tt.tag_id
      WHERE t.user_id = $1
      GROUP BY t.id
      ORDER BY t.order_key, t.created_at`,
    [userId],
  )
  return rows.map(rowToTask)
}
