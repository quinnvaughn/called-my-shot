// How long the push card stays away after someone closes it, per device.
// Each dismissal waits longer than the last, and once it has been closed four
// times it stops asking. Settings still offers push either way.
const STORAGE_KEY = "cms.pushPrompt.v1"
const COOLDOWN_DAYS = [7, 30, 90]
const DAY_MS = 24 * 60 * 60 * 1000

export type PromptDismissals = { count: number; lastAt: number }

// When the card may show again, or null if it never should.
export function nextPromptAt(
	dismissals: PromptDismissals | null,
): number | null {
	if (!dismissals || dismissals.count === 0) return 0
	const days = COOLDOWN_DAYS[dismissals.count - 1]
	if (days === undefined) return null
	return dismissals.lastAt + days * DAY_MS
}

export function isPromptCoolingDown(
	dismissals: PromptDismissals | null,
	now: number,
): boolean {
	const next = nextPromptAt(dismissals)
	return next === null || now < next
}

export function readDismissals(): PromptDismissals | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw) as Partial<PromptDismissals>
		return typeof parsed.count === "number" && typeof parsed.lastAt === "number"
			? { count: parsed.count, lastAt: parsed.lastAt }
			: null
	} catch {
		return null
	}
}

export function recordPromptDismissed(now = Date.now()): void {
	const count = (readDismissals()?.count ?? 0) + 1
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ count, lastAt: now }))
	} catch {
		// Storage blocked: the card just comes back next time.
	}
}
