import { match } from "ts-pattern"

export type AchievementKind =
	| "sweep_completed"
	| "streak_milestone"
	| "streak_personal_best"
	| "streak_snapped"

export type AchievementTextInput = {
	kind: AchievementKind
	// "NFL Player Stats" for a streak, "NFL Week 3 Sunday Early" for a sweep.
	label: string
	// The streak's length, or the sweep's game count.
	count: number
	previousBest: number | null
}

// The one sentence each sweep or streak event is told in - the in-app
// notification and the results email's achievement line both read it, so the
// two never describe the same event differently.
export function achievementText(a: AchievementTextInput): string {
	return match(a.kind)
		.with(
			"sweep_completed",
			() => `You picked every ${a.label} winner. ${a.count} for ${a.count}.`,
		)
		.with("streak_milestone", () => `${a.count} in a row on ${a.label}.`)
		.with("streak_personal_best", () =>
			a.previousBest === null
				? `New best: ${a.count} in a row on ${a.label}.`
				: `New best: ${a.count} in a row on ${a.label}. Your old best was ${a.previousBest}.`,
		)
		.with("streak_snapped", () => `Your ${a.label} streak ended at ${a.count}.`)
		.exhaustive()
}
