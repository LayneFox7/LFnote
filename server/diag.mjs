import { spawn } from 'node:child_process'
import pg from 'pg'

const log = (...a) => console.log('[diag]', ...a)

log('BEGIN', new Date().toISOString())
log('node', process.version)
log('PORT=', process.env.PORT ?? '(unset)', 'NODE_ENV=', process.env.NODE_ENV, 'PGSSL=', process.env.PGSSL)
const raw = process.env.DATABASE_URL
log('DATABASE_URL=', raw ? raw.replace(/:[^:@/]+@/, ':****@') : '(unset)')

async function dbCheck() {
  const attempts = [
    { ssl: { rejectUnauthorized: false }, tag: 'ssl' },
    { ssl: undefined, tag: 'nossl' },
  ]
  for (const a of attempts) {
    const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000, ssl: a.ssl })
    try {
      const t = Date.now()
      const r = await p.query('SELECT 1 AS ok')
      log(`DB-OK (${a.tag}) in ${Date.now() - t}ms ->`, JSON.stringify(r.rows))
      await p.end()
      return true
    } catch (e) {
      log(`DB-FAIL (${a.tag}) code=${e.code}`, e.message)
      await p.end().catch(() => {})
    }
  }
  return false
}

const dbOk = await dbCheck()

log('spawning server (server/index.js) with output capture...')
const child = spawn(process.execPath, ['server/index.js'], { stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
let err = ''
child.stdout.on('data', (d) => (out += d))
child.stderr.on('data', (d) => (err += d))
let exited = null
child.on('exit', (code, sig) => { exited = { code, sig } })
await new Promise((r) => setTimeout(r, 20000))
log('SERVER-ALIVE?', exited ? `NO (exited code=${exited.code} sig=${exited.sig})` : 'yes (still running)')
log('===SERVER-STDOUT===')
console.log(out)
log('===SERVER-STDERR===')
console.log(err)
log('END', new Date().toISOString())
process.exit(0)
