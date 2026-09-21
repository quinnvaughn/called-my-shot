import { fileURLToPath } from "node:url"
import { withJobLock } from "./job-lock"

// The standalone entry point for a job module: runs `fn` only when the file is
// executed directly (not when the scheduler imports it), then exits with its
// outcome.
//
// `lock` is the lease name the scheduler runs the same job under. Passing it
// is what stops a manual run (npm script, GitHub workflow) racing a tick.
export function runCli(
	importMetaUrl: string,
	fn: () => Promise<unknown>,
	opts: { lock?: string } = {},
): void {
	// process.argv[1] is the file's own path only when it is the entry point,
	// not when the scheduler imports it; exiting in that case would take down
	// the whole API server.
	if (process.argv[1] !== fileURLToPath(importMetaUrl)) return
	const run = async () => {
		if (!opts.lock) return fn()
		const { ran } = await withJobLock(opts.lock, async () => {
			await fn()
		})
		if (!ran) console.log(`${opts.lock} is running elsewhere, skipped`)
	}
	run()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
}
