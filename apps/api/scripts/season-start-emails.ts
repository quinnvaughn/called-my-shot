import { env } from "../src/env"
import {
	DRAIN_SEASON_START_LOCK,
	withJobLock,
} from "../src/lib/job-lock"
import {
	announceableSeasons,
	drainSeasonStartEmails,
	enqueueSeasonStartEmails,
	LEAD_DAYS,
} from "../src/lib/season-start-email"

// Thin CLI over lib/season-start-email.tsx, which is where the behaviour and
// its tests live. The scheduler runs the same two functions daily; this is
// for seeing what a run WOULD do, and for smoke-testing one account before a
// whole list gets mail.
//
//   pnpm --filter api season-start:emails                          # dry run
//   pnpm --filter api season-start:emails -- --league=nfl          # one league
//   pnpm --filter api season-start:emails -- --lead-days=14        # look further out
//
// Send yourself the real thing in production before anyone else gets one:
//   pnpm --filter api season-start:emails -- --league=nfl --user=you@example.com --commit --send
//
// --send drains right here instead of waiting for the api machine's cron, so
// the mail goes out now and is rendered by THIS checkout - which is what lets
// you see a copy change without deploying first.
function flag(name: string): string | undefined {
	const hit = process.argv.find((a) => a.startsWith(`--${name}`))
	if (!hit) return undefined
	return hit.includes("=") ? hit.split("=")[1] : "true"
}

const leagueSlug = flag("league")
const onlyUser = flag("user")
const commit = flag("commit") === "true"
const send = flag("send") === "true"

const leadDays = Number(flag("lead-days") ?? LEAD_DAYS)
if (!Number.isFinite(leadDays) || leadDays <= 0 || leadDays > 60) {
	console.error("--lead-days must be a number between 1 and 60")
	process.exit(1)
}

if (send && (!onlyUser || !commit)) {
	console.error(
		"--send requires --user and --commit. Draining the whole queue by hand is what the scheduler is for.",
	)
	process.exit(1)
}

// Without a key, sendMail logs the message and reports success, so the drain
// would stamp every row sent without anything leaving the building - and the
// unique constraint means those people can never be mailed about that season
// again. Refuse rather than discover that afterwards.
if (send && !env.RESEND_API_KEY) {
	console.error(
		"--send needs RESEND_API_KEY in apps/api/.env. Without it sendMail only logs, but the rows would still be marked sent.",
	)
	process.exit(1)
}

// Every link in the email - the games tab, the ballots, the unsubscribe
// footer, the logo - is built from CLIENT_ORIGIN. Draining locally against a
// dev origin produces a real email full of localhost URLs and consumes the
// rows doing it.
if (send && !env.CLIENT_ORIGIN.startsWith("https://")) {
	console.error(
		`--send would build every link from CLIENT_ORIGIN=${env.CLIENT_ORIGIN}. Point it at the public site first.`,
	)
	process.exit(1)
}

const seasons = await announceableSeasons({ leadDays, leagueSlug })

if (seasons.length === 0) {
	console.log(
		`No season starts within ${leadDays} days${leagueSlug ? ` for ${leagueSlug}` : ""} with games or ballots synced.`,
	)
	console.log(
		"A season with neither is deliberately skipped - see announceableSeasons.",
	)
	process.exit(0)
}

console.log(`${seasons.length} season(s) announceable within ${leadDays} days:`)
for (const s of seasons) {
	console.log(
		`   ${s.leagueName} ${s.seasonDisplayName}  first game ${s.startsAt.toISOString()}  ` +
			`${s.gameCount} game(s) on ${s.openingLabel}, ${s.ballotCount} ballot(s)`,
	)
}

const result = await enqueueSeasonStartEmails({
	leadDays,
	leagueSlug,
	onlyUser,
	commit,
})

if (!commit) {
	console.log("\nDry run. Re-run with --commit to queue these.")
	process.exit(0)
}

console.log(
	`\nQueued ${result.queued} row(s)${onlyUser ? ` for ${onlyUser}` : ""}. Rows already queued or already sent are left alone.`,
)

if (send) {
	console.log("Draining now...")
	// The same lock the scheduler's drain tick takes - see the equivalent in
	// backfill-resolution-emails.ts.
	const { ran } = await withJobLock(DRAIN_SEASON_START_LOCK, async () => {
		const drained = await drainSeasonStartEmails()
		console.log(
			`Sent ${drained.sent}, skipped ${drained.skipped}, failed ${drained.failed}, from ${env.EMAIL_FROM_ANNOUNCEMENTS}.`,
		)
	})
	if (!ran) {
		console.log(
			"A scheduler drain is already running - it will send these on its tick.",
		)
	}
} else {
	console.log(
		"The drain sends them on its next run (every 5 min on the api machine).",
	)
	console.log("To abort before anything sends:")
	console.log("  delete from season_start_emails where sent_at is null;")
}
