import { sql } from "drizzle-orm"
import { db } from "../src/db"

// Fills in the final_score rows for box scores captured before that scope
// existed. The score isn't a box-score cell, so it can't be derived from the
// rows already stored - but it is already on games, synced by
// sync-live-scores, so this needs no ESPN requests.
//
// A script rather than a data migration because Postgres refuses to use a
// newly added enum value in the transaction that added it, and drizzle-kit
// runs migrations in one.
//
//   pnpm --filter api backfill:final-scores            # dry run
//   pnpm --filter api backfill:final-scores -- --commit
//
// Idempotent: ON CONFLICT DO NOTHING, so re-running is free. Games with no
// captured box score are left alone - the box score backfill writes every
// scope including this one.
const SELECT_SOURCE = sql`
	FROM "games" g
	JOIN LATERAL (
		SELECT DISTINCT "team_id", "opponent_team_id", "is_home"
		FROM "team_game_stats"
		WHERE "game_id" = g."id"
	) s ON true
	WHERE g."box_score_synced_at" IS NOT NULL
		AND g."home_score" IS NOT NULL
		AND g."away_score" IS NOT NULL
`

const commit = process.argv.includes("--commit")

const { rows: pending } = await db.execute<{ count: string }>(sql`
	SELECT count(*) AS count ${SELECT_SOURCE}
`)
const total = Number(pending[0]?.count ?? 0)

if (total === 0) {
	console.log("No captured games are missing a final score row.")
	process.exit(0)
}

if (!commit) {
	console.log(`${total} team row(s) to write. Re-run with --commit.`)
	process.exit(0)
}

const { rowCount } = await db.execute(sql`
	INSERT INTO "team_game_stats" (
		"game_id", "source", "team_id", "opponent_team_id", "is_home",
		"game_date", "season_id", "league_id", "scope", "stat_key",
		"value_text", "value_numeric"
	)
	SELECT g."id", 'espn', s."team_id", s."opponent_team_id", s."is_home",
		g."starts_at", g."season_id", g."league_id", 'final_score', 'score',
		(CASE WHEN s."is_home" THEN g."home_score" ELSE g."away_score" END)::text,
		(CASE WHEN s."is_home" THEN g."home_score" ELSE g."away_score" END)
	${SELECT_SOURCE}
	ON CONFLICT ("game_id", "team_id", "scope", "stat_key") DO NOTHING
`)

console.log(`Wrote ${rowCount ?? 0} final score row(s).`)
process.exit(0)
