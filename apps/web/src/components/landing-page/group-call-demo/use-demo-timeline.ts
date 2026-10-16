import { useEffect, useState } from "react"
import { useMediaQuery } from "#/hooks/use-media-query"
import { DEMO_CONVICTION } from "./demo-fixture"

// The demo's beats, in order. Each one leaves everything before it showing.
export const DEMO_STEP = {
	idle: 0,
	picked: 1,
	conviction: 2,
	locked: 3,
	final: 4,
	board: 5,
	presser: 6,
} as const

// When each step arrives, in ms from the start of a run.
const SCHEDULE: [number, number][] = [
	[700, DEMO_STEP.picked],
	[1500, DEMO_STEP.conviction],
	[3300, DEMO_STEP.locked],
	[4800, DEMO_STEP.final],
	[5800, DEMO_STEP.board],
	[6600, DEMO_STEP.presser],
]
const CONVICTION_FILL_MS = 1100
// How long the finished state holds before the next run starts.
const LOOP_MS = 13000

// Drives the demo: which step it's on and how far the conviction bar has
// filled. With reduced motion it sits on the finished state, and replay
// restarts it from the top.
export function useDemoTimeline() {
	const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
	const [run, setRun] = useState(0)
	const [step, setStep] = useState<number>(DEMO_STEP.idle)
	const [conviction, setConviction] = useState(0)

	// biome-ignore lint/correctness/useExhaustiveDependencies: run restarts it
	useEffect(() => {
		if (reduceMotion) {
			setStep(DEMO_STEP.presser)
			setConviction(DEMO_CONVICTION)
			return
		}

		setStep(DEMO_STEP.idle)
		setConviction(0)
		let frame: number | null = null
		const timers = SCHEDULE.map(([at, next]) =>
			setTimeout(() => {
				setStep(next)
				if (next === DEMO_STEP.conviction) frame = fillConviction()
			}, at),
		)
		timers.push(setTimeout(() => setRun((r) => r + 1), LOOP_MS))

		function fillConviction(): number {
			const start = performance.now()
			const tick = (now: number) => {
				const t = Math.min(1, (now - start) / CONVICTION_FILL_MS)
				// Ease out, so it settles on the value instead of stopping dead.
				setConviction(Math.round((1 - (1 - t) ** 3) * DEMO_CONVICTION))
				if (t < 1) frame = requestAnimationFrame(tick)
			}
			return requestAnimationFrame(tick)
		}

		return () => {
			for (const timer of timers) clearTimeout(timer)
			if (frame !== null) cancelAnimationFrame(frame)
		}
	}, [run, reduceMotion])

	return { step, conviction, replay: () => setRun((r) => r + 1) }
}
