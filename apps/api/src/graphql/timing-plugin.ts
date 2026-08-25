import type { ApolloServerPlugin } from "@apollo/server"

// Server-Timing on the web app (lib/server-timing.ts) can only show "the
// HomePage query took 580ms" as one number - it can't see inside the API's
// own resolver chain. This does: it wraps every field resolution and, per
// request, logs the slowest ones. Diagnostic only - not meant to stay wired
// in once the remaining home-query latency is actually explained.
export const timingPlugin: ApolloServerPlugin = {
	async requestDidStart({ request }) {
		const maxDurationByField = new Map<string, number>()

		return {
			async executionDidStart() {
				return {
					willResolveField({ info }) {
						const start = performance.now()
						const key = `${info.parentType.name}.${info.fieldName}`
						return () => {
							const duration = performance.now() - start
							const existing = maxDurationByField.get(key) ?? 0
							if (duration > existing) {
								maxDurationByField.set(key, duration)
							}
						}
					},
				}
			},
			async willSendResponse() {
				const sorted = [...maxDurationByField.entries()]
					.sort((a, b) => b[1] - a[1])
					.slice(0, 15)
				if (sorted.length === 0) return
				const summary = sorted
					.map(([field, ms]) => `${field}=${ms.toFixed(1)}ms`)
					.join(" ")
				// pothos-drizzle's own relation batching defers its query via
				// setTimeout(fn, 0) rather than a microtask - on Fly's shared-cpu
				// machines that callback doesn't run in ~0ms, it runs whenever the
				// shared vCPU next gets scheduled, which under contention can be
				// tens of ms. Every field above that goes through that batching
				// (game/stat/league/options/fieldPct/...) is stuck in the same
				// 60-300ms range regardless of DB/pool state, while fields resolved
				// with a plain synchronous db call (Query.questions, Me's fields)
				// stay in single digits - this measures that gap directly instead
				// of inferring it.
				const timerStart = performance.now()
				await new Promise<void>((resolve) => setTimeout(resolve, 0))
				const timerDelay = performance.now() - timerStart
				console.log(
					`[field-timing] ${request.operationName ?? "anonymous"}: setTimeout0Delay=${timerDelay.toFixed(1)}ms ${summary}`,
				)
			},
		}
	},
}
