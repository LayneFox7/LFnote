import { readFileSync } from 'node:fs'
import { pool, query } from '../db.js'

const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
console.log('Applying schema to Postgres…')
await query(sql)
console.log('Schema applied.')
await pool.end()
