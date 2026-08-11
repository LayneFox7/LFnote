import { readFileSync } from 'node:fs'
import { query, closePool } from '../db.js'

const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
console.log('Applying schema to Postgres…')
await query(sql)
console.log('Schema applied.')
await closePool()
