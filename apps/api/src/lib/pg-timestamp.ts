// Postgres's text-protocol output for a `timestamp` (no time zone) column
// has no timezone marker and uses a space separator ("2026-09-01
// 16:15:39.856777"), not the "...Z"/"+00:00" form `Date` needs to recognize
// it as UTC. `new Date(raw)` on it silently parses as the Node process's
// LOCAL time zone instead - every timestamp column in this schema is
// actually written/read in UTC (see defaultNow()) - producing a Date offset
// by the host machine's UTC delta (confirmed live: a call's created_at came
// back reading ~5 hours in the future on a UTC-5 host). This only bites raw
// db.execute()/sql<> results - drizzle's own typed query builder (db.select/
// db.query) already reconstructs these correctly via node-postgres's
// built-in per-column type parser, which never runs for a literal SQL
// string surfaced through execute(). Any raw-SQL timestamp column read back
// through db.execute() needs this, not just `new Date(...)`.
export function parsePgTimestamp(raw: string): Date {
	return new Date(`${raw.replace(" ", "T")}Z`)
}
