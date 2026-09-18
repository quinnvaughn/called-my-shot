import pg from "pg"
import { guestPickLeagues, orderGuestPicks } from "./src/components/landing-page/guest-picks/select-guest-picks.ts"

const client = new pg.Client({
	connectionString: "postgres://postgres:postgres@localhost:5433/called_my_shot",
})
await client.connect()
const SHAPES = `('team_vs_team','yes_no_prop','player_stat_over_under','team_stat_over_under','game_total_over_under','player_vs_player')`
const { rows } = await client.query(`
  select r.id, r.shape, r.locks_at, r.title, l.id as league_id, l.abbreviation
  from (
    select q.*, row_number() over (
      partition by q.league_id order by q.locks_at asc, q.id desc
    ) as rank
    from questions q join leagues l2 on l2.id = q.league_id
    where q.is_official and q.status = 'open' and l2.status = 'active'
      and q.locks_at > now() + interval '20 minutes' and q.shape in ${SHAPES}
  ) r join leagues l on l.id = r.league_id
  where r.rank <= 8 order by r.locks_at asc, r.id desc
`)
await client.end()

const candidates = rows.map((r) => ({
	id: r.id,
	shape: r.shape.toUpperCase(),
	locksAt: r.locks_at.toISOString(),
	title: r.title,
	league: { id: r.league_id, abbreviation: r.abbreviation },
}))

const now = Date.now()
for (const league of guestPickLeagues(candidates, now)) {
	const stack = orderGuestPicks(candidates, now, league.id).slice(0, 3)
	const allSame = stack.every((q) => q.league.id === league.id)
	console.log(`\n[${league.abbreviation}] chip  -> header: "Try it: make 3 ${allSame ? `${league.abbreviation} ` : ""}calls"`)
	for (const q of stack) {
		console.log(`   ${q.league.abbreviation === league.abbreviation ? "  " : "!!"} ${q.league.abbreviation.padEnd(4)} ${q.title.slice(0, 58)}`)
	}
}
