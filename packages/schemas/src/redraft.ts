import { match } from "ts-pattern"
import { z } from "zod"
import { POST_BODY_MAX } from "./posts"

// How long a redraft can be: the author picks one of these for the class,
// the composer shows them as chips with the default chosen, and the api
// accepts only these counts. "First round" is that year's real number of
// first-round picks, so it changes as leagues grew.

export type RedraftLength = {
	count: number
	label: string
	isDefault: boolean
}

type LengthOption = "top5" | "top10" | "lottery" | "firstRound"

const LEAGUE_LENGTHS: Record<
	string,
	{ options: LengthOption[]; default: LengthOption }
> = {
	nba: {
		options: ["top5", "top10", "lottery", "firstRound"],
		default: "lottery",
	},
	nfl: { options: ["top10", "firstRound"], default: "firstRound" },
	nhl: { options: ["top5", "top10", "firstRound"], default: "top10" },
	mlb: { options: ["top5", "top10", "firstRound"], default: "top10" },
}

const FALLBACK_LENGTHS: { options: LengthOption[]; default: LengthOption } = {
	options: ["top5", "top10", "firstRound"],
	default: "top10",
}

// The NBA's lottery is its first 14 picks. Before the first lottery, in
// 1985, those were just the first 14.
const LOTTERY_SIZE = 14
const FIRST_LOTTERY = 1985

// The lengths a class can be redrafted at, shortest first. An option that
// isn't shorter than the whole first round (as in the years leagues were
// small) is left out, and the default falls back to the first round when its
// own option is gone.
export function redraftLengths(
	leagueSlug: string,
	year: number,
	firstRoundSize: number,
): RedraftLength[] {
	const league = LEAGUE_LENGTHS[leagueSlug] ?? FALLBACK_LENGTHS
	const lengths = league.options.flatMap((option) => {
		const { count, label } = match(option)
			.with("top5", () => ({ count: 5, label: "Top 5" }))
			.with("top10", () => ({ count: 10, label: "Top 10" }))
			.with("lottery", () => ({
				count: LOTTERY_SIZE,
				label: year >= FIRST_LOTTERY ? "Lottery" : "Top 14",
			}))
			.with("firstRound", () => ({
				count: firstRoundSize,
				label: "First round",
			}))
			.exhaustive()
		if (count < 1) return []
		if (option !== "firstRound" && count >= firstRoundSize) return []
		return [{ option, count, label }]
	})
	const defaultOption = lengths.some(({ option }) => option === league.default)
		? league.default
		: "firstRound"
	return lengths.map(({ option, count, label }) => ({
		count,
		label,
		isDefault: option === defaultOption,
	}))
}

// A redraft's picks in slot order: playerIds[0] is the first pick. How many
// there are is the length, which the api checks against the class's
// redraftLengths.
export const createRedraftSchema = z.object({
	promptId: z.string().uuid(),
	groupId: z.string().uuid().nullish(),
	body: z
		.string()
		.trim()
		.max(POST_BODY_MAX, `Keep it under ${POST_BODY_MAX} characters`)
		.default(""),
	playerIds: z
		.array(z.string().uuid())
		.min(1, "Fill every slot")
		.max(64)
		.refine(
			(ids) => new Set(ids).size === ids.length,
			"A player can only go once",
		),
})
export type CreateRedraftInput = z.input<typeof createRedraftSchema>

// How far a pick moved from the real draft: up when taken earlier than they
// really were, down when later, same when in their real slot. Undrafted
// players have no real slot to measure from. The page and the share image
// both draw this as a pill: green up, red down, a grey "Same".
export type RedraftMove =
	| { kind: "up" | "down"; by: number }
	| { kind: "same" }
	| { kind: "undrafted" }

export function redraftMove(
	slot: number,
	original: number | null,
): RedraftMove {
	if (original === null) return { kind: "undrafted" }
	if (original === slot) return { kind: "same" }
	return original > slot
		? { kind: "up", by: original - slot }
		: { kind: "down", by: slot - original }
}

// The green and red the pills are drawn in, on the app's own dark ground so
// they read on any team's color.
export const REDRAFT_UP_COLOR = "#34D399"
export const REDRAFT_DOWN_COLOR = "#E24B4A"
