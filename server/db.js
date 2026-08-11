import pg from 'pg'

const { Pool } = pg

export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'lfn',
        password: process.env.PGPASSWORD || 'lfn_dev_2026',
        database: process.env.PGDATABASE || 'lfnote',
      },
)

export const query = (text, params) => pool.query(text, params)

export const rowToTask = (r) => ({
  id: r.id,
  text: r.text,
  date: r.date,
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
