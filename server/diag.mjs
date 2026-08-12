import { spawn } from 'node:child_process'
import pg from 'pg'

const log = (...a) => console.log('[diag]', ...a)

log('BEGIN', new Date().toISOString())
log('node', process.version)
log('PORT=', process.env.PORT ?? '(unset)', 'NODE_ENV=', process.env.NODE_ENV)

const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000, ssl: { rejectUnauthorized: false } })
try {
  const t = Date.now()
  await p.query('SELECT 1')
  log(`DB-OK in ${Date.now() - t}ms`)
} catch (e) {
  log('DB-FAIL', e.code, e.message)
}
await p.end().catch(() => {})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const chain = 'node server/scripts/init-db.mjs && node server/index.js'
log('CHAIN: spawning sh -c', chain)
const child = spawn('sh', ['-c', chain], { stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
let err = ''
child.stdout.on('data', (d) => (out += d))
child.stderr.on('data', (d) => (err += d))
let exited = null
child.on('exit', (code, sig) => {
  exited = { code, sig }
})
await wait(12000)
log('CHAIN: EXITED?', exited ? `yes code=${exited.code} sig=${exited.sig}` : 'NO (still running after 12s) — сервер жив')
log('===CHAIN-STDOUT===')
console.log(out)
log('===CHAIN-STDERR===')
console.log(err)
if (!exited) child.kill('SIGKILL')
log('END', new Date().toISOString())
process.exit(0)
