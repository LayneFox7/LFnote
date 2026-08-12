import { spawn } from 'node:child_process'
import pg from 'pg'

const log = (...a) => console.log('[diag]', ...a)

log('BEGIN', new Date().toISOString())
log('node', process.version)
log('PORT=', process.env.PORT ?? '(unset)', 'NODE_ENV=', process.env.NODE_ENV)

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

await dbCheck()

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const watch = (name, cmd, args, ms) =>
  new Promise(async (resolve) => {
    log(`${name}: spawning`, cmd, ...args)
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    let exited = null
    child.on('exit', (code, sig) => {
      exited = { code, sig }
    })
    await wait(ms)
    log(`${name}: EXITED?`, exited ? `yes code=${exited.code} sig=${exited.sig}` : `NO (still running after ${ms / 1000}s)`)
    log(`===${name}-STDOUT===`)
    console.log(out)
    log(`===${name}-STDERR===`)
    console.log(err)
    if (!exited) child.kill('SIGKILL')
    resolve()
  })

await watch('INITDB', process.execPath, ['server/scripts/init-db.mjs'], 15000)
await watch('SERVER', process.execPath, ['server/index.js'], 8000)
log('END', new Date().toISOString())
process.exit(0)
