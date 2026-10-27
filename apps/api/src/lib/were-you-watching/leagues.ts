import { match } from "ts-pattern"
import type { WatchLeagueSlug, WatchTemplate } from "./templates/common"
import { MLB_TEMPLATES } from "./templates/mlb"
import { NBA_TEMPLATES } from "./templates/nba"
import { NFL_TEMPLATES } from "./templates/nfl"
import { NHL_TEMPLATES } from "./templates/nhl"

// Each question's clock, from when the server shows it.
export const QUESTION_MS = 10_000
// Slack past the clock for the answer's trip to the server.
export const GRACE_MS = 1_500
// The fastest a signed-out answer is taken to have been, when it's saved.
export const MIN_ANSWER_MS = 500

export const MIN_QUESTIONS = 5
export const MAX_QUESTIONS = 8

export type WatchLeague = {
	slug: WatchLeagueSlug
	// How long after a game its quiz stays up when no newer game replaces
	// it. Clears each league's longest normal in-season gap (an NFL Thursday
	// game then a bye, a sweep waiting on the next round) so only the
	// offseason greys a team out.
	staleDays: number
	// In priority order. The final score is always last.
	templates: WatchTemplate[]
}

export function watchLeague(slug: string): WatchLeague | null {
	return match(slug)
		.with("nba", () => ({
			slug: "nba" as const,
			staleDays: 12,
			templates: NBA_TEMPLATES,
		}))
		.with("nfl", () => ({
			slug: "nfl" as const,
			staleDays: 20,
			templates: NFL_TEMPLATES,
		}))
		.with("mlb", () => ({
			slug: "mlb" as const,
			staleDays: 9,
			templates: MLB_TEMPLATES,
		}))
		.with("nhl", () => ({
			slug: "nhl" as const,
			staleDays: 12,
			templates: NHL_TEMPLATES,
		}))
		.otherwise(() => null)
}
