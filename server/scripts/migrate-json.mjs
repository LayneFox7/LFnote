import { readFileSync, existsSync } from 'node:fs'
import { query, closePool } from '../db.js'
import { hashPassword } from '../auth.js'

const dataDir = new URL('../../data/', import.meta.url)
const read = (file, fallback) => {
  const path = new URL(file, dataDir)
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, 'utf8'))
}

const LOGIN = process.env.SEED_LOGIN || 'demo'
const PASSWORD = process.env.SEED_PASSWORD || 'demo123'

const tasksJson = read('tasks.json', { tasks: [] }).tasks
const linksJson = read('links.json', { links: [] }).links
const tagsJson = read('tags.json', { tags: [] }).tags
const columnsJson = read('columns.json', { columns: {} }).columns

// Пользователь-владелец переносимых данных
let userId = (await query(`SELECT id FROM users WHERE login = $1`, [LOGIN])).rows[0]?.id
if (!userId) {
  const { rows } = await query(`INSERT INTO users (login, password_hash) VALUES ($1, $2) RETURNING id`, [
    LOGIN,
    hashPassword(PASSWORD),
  ])
  userId = rows[0].id
  console.log(`Создан аккаунт "${LOGIN}" (пароль: ${PASSWORD})`)
} else {
  console.log(`Аккаунт "${LOGIN}" уже существует, данные добавляются в него`)
}

let inserted = 0
for (const t of tasksJson) {
  const exists = (await query(`SELECT id FROM tasks WHERE id = $1`, [t.id])).rows.length > 0
  if (exists) continue
  await query(
    `INSERT INTO tasks (id, user_id, text, date, done, order_key, style, created_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      t.id,
      userId,
      t.text,
      t.date,
      !!t.done,
      typeof t.order === 'number' ? t.order : 1000,
      t.style ?? null,
      t.createdAt ? new Date(t.createdAt) : new Date(),
      t.completedAt ? new Date(t.completedAt) : null,
    ],
  )
  inserted++
}

let tagCount = 0
for (const name of tagsJson) {
  await query(`INSERT INTO tags (user_id, name) VALUES ($1, $2) ON CONFLICT (user_id, name) DO NOTHING`, [userId, name])
  tagCount++
}

let ttCount = 0
for (const t of tasksJson) {
  for (const name of t.tags ?? []) {
    const tag = (await query(`SELECT id FROM tags WHERE user_id = $1 AND name = $2`, [userId, name])).rows[0]
    if (!tag) continue
    await query(`INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [t.id, tag.id])
    ttCount++
  }
}

let linkCount = 0
for (const l of linksJson) {
  await query(
    `INSERT INTO links (id, user_id, from_id, to_id, style, created_at)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
    [l.id, userId, l.from, l.to, l.style ?? null, l.createdAt ? new Date(l.createdAt) : new Date()],
  )
  linkCount++
}

let colCount = 0
for (const [date, color] of Object.entries(columnsJson)) {
  await query(
    `INSERT INTO columns (user_id, date, color) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, date) DO UPDATE SET color = EXCLUDED.color`,
    [userId, date, color],
  )
  colCount++
}

console.log(`Готово: карточек ${inserted}, тегов ${tagCount}, связей тегов ${ttCount}, стрелок ${linkCount}, цветов колонок ${colCount}`)
await closePool()
