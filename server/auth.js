import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { query } from './db.js'

export const SESSION_COOKIE = 'lfn_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const LOGIN_RE = /^[a-zA-Z0-9_-]{3,40}$/
export const MIN_PASSWORD_LEN = 6

export function validateCredentials(login, password) {
  if (typeof login !== 'string' || !LOGIN_RE.test(login)) {
    return 'Логин: 3–40 символов (латиница, цифры, _ или -)'
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LEN) {
    return `Пароль: минимум ${MIN_PASSWORD_LEN} символов`
  }
  return null
}

export const hashPassword = (password) => bcrypt.hashSync(password, 10)
export const verifyPassword = (password, hash) => bcrypt.compareSync(password, hash)

export async function createSession(userId) {
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await query(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`, [token, userId, expiresAt])
  return token
}

export async function destroySession(token) {
  if (!token) return
  await query(`DELETE FROM sessions WHERE token = $1`, [token])
}

export async function getUserBySession(token) {
  if (!token) return null
  const { rows } = await query(
    `SELECT u.id, u.login, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = $1`,
    [token],
  )
  if (rows.length === 0) return null
  const row = rows[0]
  if (row.expires_at.getTime() < Date.now()) {
    await query(`DELETE FROM sessions WHERE token = $1`, [token])
    return null
  }
  return { id: row.id, login: row.login }
}

export async function requireAuth(req, res, next) {
  const user = await getUserBySession(req.cookies?.[SESSION_COOKIE] ?? null)
  if (!user) return res.status(401).json({ error: 'Требуется авторизация' })
  req.user = user
  next()
}

export async function getUserByLogin(login) {
  const { rows } = await query(`SELECT * FROM users WHERE login = $1`, [login])
  return rows[0] ?? null
}
