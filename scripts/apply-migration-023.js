/**
 * Applies migration 023_finance_integrity.sql directly to the remote Supabase database.
 * 
 * Usage:
 *   node scripts/apply-migration-023.js YOUR_DB_PASSWORD
 * 
 * Find your database password in:
 *   Supabase Dashboard > Project Settings > Database > Database password
 */

const { Client } = require("pg")
const fs = require("fs")
const path = require("path")

const DB_PASSWORD = process.argv[2]

if (!DB_PASSWORD) {
  console.error("Usage: node scripts/apply-migration-023.js YOUR_DB_PASSWORD")
  console.error("")
  console.error("Find your password in: Supabase Dashboard > Project Settings > Database")
  process.exit(1)
}

const PROJECT_REF = "bgauvkedqzsxnwstdzsk"

const connectionString = `postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`

async function main() {
  const sqlPath = path.join(__dirname, "..", "supabase", "migrations", "023_finance_integrity.sql")
  const sql = fs.readFileSync(sqlPath, "utf8")

  console.log("Connecting to database...")
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

  try {
    await client.connect()
    console.log("Connected. Applying migration 023_finance_integrity.sql...")
    await client.query(sql)
    console.log("Migration applied successfully!")
  } catch (err) {
    if (err.message.includes("already exists")) {
      console.log("Some objects already exist (safe to ignore). Migration likely already applied.")
    } else {
      console.error("Migration failed:", err.message)
      process.exit(1)
    }
  } finally {
    await client.end()
  }
}

main()
