import { setTimeout as sleep } from "node:timers/promises"
import { EspnRequestError } from "./espn-client"

// ESPN publishes no limits for these unauthenticated endpoints, so requests go
// out one at a time with a gap and a run never bursts.
export const DEFAULT_ESPN_SPACING_MS = 250

// ESPN turning us away. Anything else is one failed request.
const REFUSAL_STATUSES = [403, 429]

export type EspnRequester = ReturnType<typeof createEspnRequester>

// One job run's access to ESPN. Spaces requests out, counts them for the log
// line, and splits failures in two: ESPN refusing us throws and ends the run,
// while any other failure is logged and returns null, leaving the affected work
// due for the next run.
export function createEspnRequester(jobName: string, spacingMs: number) {
	let lastRequestAt = 0
	let count = 0

	async function request<T>(
		label: string,
		fetcher: () => Promise<T>,
	): Promise<T | null> {
		const wait = lastRequestAt + spacingMs - Date.now()
		if (wait > 0) await sleep(wait)
		count++
		try {
			return await fetcher()
		} catch (err) {
			if (
				err instanceof EspnRequestError &&
				REFUSAL_STATUSES.includes(err.status)
			) {
				throw err
			}
			console.error(`[${jobName}] ${label} failed:`, err)
			return null
		} finally {
			lastRequestAt = Date.now()
		}
	}

	return { request, count: () => count }
}
