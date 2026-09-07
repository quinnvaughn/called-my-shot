import { backfillResolutionEmails } from "../src/lib/email-backfill"

// Thin CLI over lib/email-backfill.ts, which is where the behaviour and its
// tests live.
//
//   pnpm --filter api backfill:emails -- --days=4                    # dry run
//   pnpm --filter api backfill:emails -- --days=4 --new-users-only
//   pnpm --filter api backfill:emails -- --days=4 --commit
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

const result = await backfillResolutionEmails({ days, newUsersOnly, commit })

console.log(
	`${result.candidates} candidate call(s) resolved in the last ${days} days${
		newUsersOnly ? " from accounts created in that window" : ""
	}`,
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

console.log(
	`\nQueued ${result.queued} row(s). The drain sends them on its next run once they clear the settling window (~15 min).`,
)
console.log("To abort before anything sends:")
console.log("  delete from email_outbox where sent_at is null;")
