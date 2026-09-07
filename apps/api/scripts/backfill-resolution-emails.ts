import { drainResolutionDigests } from "../src/lib/email-digest"
import { backfillResolutionEmails } from "../src/lib/email-backfill"
import { env } from "../src/env"

// Thin CLI over lib/email-backfill.ts, which is where the behaviour and its
// tests live.
//
//   pnpm --filter api backfill:emails -- --days=4                    # dry run
//   pnpm --filter api backfill:emails -- --days=4 --new-users-only
//   pnpm --filter api backfill:emails -- --days=4 --commit
//
// Smoke-test on yourself in production before anyone else gets one:
//   pnpm --filter api backfill:emails -- --days=4 --user=you@example.com --commit --send
//
// --send drains right here instead of leaving it to the api machine's cron,
// so the mail goes out now and is rendered by THIS checkout - which is what
// lets you see a copy change without deploying first.
function flag(name: string): string | undefined {
	const hit = process.argv.find((a) => a.startsWith(`--${name}`))
	if (!hit) return undefined
	return hit.includes("=") ? hit.split("=")[1] : "true"
}

const days = Number(flag("days") ?? 7)
if (!Number.isFinite(days) || days <= 0 || days > 30) {
	console.error("--days must be a number between 1 and 30")
	process.exit(1)
}

const commit = flag("commit") === "true"
const newUsersOnly = flag("new-users-only") === "true"
const onlyUser = flag("user")
const send = flag("send") === "true"
// --send has to skip the settling window too, or the drain it runs would find
// nothing eligible yet.
const immediate = send || flag("immediate") === "true"

if (send && (!onlyUser || !commit)) {
	console.error("--send requires --user and --commit.")
	process.exit(1)
}

// Without a key, sendMail logs the message and reports success, so the drain
// would stamp every row sent without anything leaving the building - burning
// the backfill silently. Refuse rather than discover that afterwards.
if (send && !env.RESEND_API_KEY) {
	console.error(
		"--send needs RESEND_API_KEY in apps/api/.env. Without it sendMail only logs, but the rows would still be marked sent.",
	)
	process.exit(1)
}

// Every link in the email - the share deep-links, the unsubscribe footer, the
// logo - is built from CLIENT_ORIGIN. Draining locally against a dev origin
// produces a real email full of localhost URLs and consumes the rows doing it.
if (send && !env.CLIENT_ORIGIN.startsWith("https://")) {
	console.error(
		`--send would build every link from CLIENT_ORIGIN=${env.CLIENT_ORIGIN}. Point it at the public site first.`,
	)
	process.exit(1)
}

if (immediate && !onlyUser) {
	console.error(
		"--immediate only works with --user. The settling window is the abort window for a real backfill; skipping it for one test account is fine, for a whole cohort is not.",
	)
	process.exit(1)
}

const result = await backfillResolutionEmails({
	days,
	onlyUser,
	immediate,
	newUsersOnly,
	commit,
})

console.log(
	`${result.candidates} candidate call(s) resolved in the last ${days} days${
		newUsersOnly ? " from accounts created in that window" : ""
	}${onlyUser ? ` for ${onlyUser}` : ""}`,
)
console.log(
	`${result.candidates - result.dropped} sendable, ${result.dropped} dropped (no final points or no longer resolved)`,
)
console.log(`→ ${result.callsByUser.size} email(s), one per user`)
for (const [userId, count] of [...result.callsByUser].sort(
	(a, b) => b[1] - a[1],
)) {
	console.log(`   ${userId}  ${count} call(s)`)
}

if (!commit) {
	console.log("\nDry run. Re-run with --commit to queue these.")
	process.exit(0)
}

if (send) {
	console.log(`\nQueued ${result.queued} row(s). Draining now...`)
	const drained = await drainResolutionDigests()
	console.log(
		`Sent ${drained.sent} row(s), skipped ${drained.skipped}, from ${env.EMAIL_FROM_NOTIFICATIONS}.`,
	)
} else if (immediate) {
	console.log(
		`\nQueued ${result.queued} row(s), backdated past the settling window - the next drain tick (runs every 5 min on the api machine) will send them.`,
	)
} else {
	console.log(
		`\nQueued ${result.queued} row(s). The drain sends them on its next run once they clear the settling window (~15 min).`,
	)
	console.log("To abort before anything sends:")
	console.log("  delete from email_outbox where sent_at is null;")
}
