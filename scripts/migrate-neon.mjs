import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before migration");
const sql = neon(process.env.DATABASE_URL);
const source = await readFile(new URL("../src/storage/migrations/001-postgres.sql", import.meta.url), "utf8");
const statements = source.split(";").map(s => s.trim()).filter(s => s && s !== "BEGIN" && s !== "COMMIT");
await sql.transaction(statements.map(s => sql.query(s, [])));
console.log("Neon schema is ready. No existing rows were removed.");
