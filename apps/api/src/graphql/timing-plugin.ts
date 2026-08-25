import type { ApolloServerPlugin } from "@apollo/server"

// Server-Timing on the web app (lib/server-timing.ts) can only show "the
// HomePage query took 580ms" as one number - it can't see inside the API's
// own resolver chain. This does: it wraps every field resolution and, per
// request, logs the slowest ones. Diagnostic only - not meant to stay wired
// in once the remaining home-query latency is actually explained.
export const timingPlugin: ApolloServerPlugin = {
	async requestDidStart({ request }) {
		const requestStart = performance.now()
		const maxDurationByField = new Map<string, number>()
		let parsingMs = 0
		let validationMs = 0
		let executionMs = 0

		return {
			async parsingDidStart() {
				const start = performance.now()
				return async () => {
					parsingMs = performance.now() - start
				}
			},
			async validationDidStart() {
				const start = performance.now()
				return async () => {
					validationMs = performance.now() - start
				}
			},
			async executionDidStart() {
				const executionStart = performance.now()
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
					async executionDidEnd() {
						executionMs = performance.now() - executionStart
					},
				}
			},
			async willSendResponse() {
				const sorted = [...maxDurationByField.entries()]
					.sort((a, b) => b[1] - a[1])
					.slice(0, 15)
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
				// Field-level timing above only covers execution - it can't explain
				// a gap between the sum of field durations and the total request
				// time, because that gap could be parsing/validation (measured
				// above), or Express/cors/json-body-parser middleware and response
				// serialization, which run entirely outside Apollo's own plugin
				// hooks and so never show up in field-timing no matter how deep
				// this instrumentation goes.
				const totalMs = performance.now() - requestStart
				console.log(
					`[field-timing] ${request.operationName ?? "anonymous"}: total=${totalMs.toFixed(1)}ms parsing=${parsingMs.toFixed(1)}ms validation=${validationMs.toFixed(1)}ms execution=${executionMs.toFixed(1)}ms setTimeout0Delay=${timerDelay.toFixed(1)}ms ${summary}`,
				)
			},
		}
	},
}
