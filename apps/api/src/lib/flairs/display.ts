import { match } from "ts-pattern"
import type { Flair } from "../../db/schema"

// What a flair actually renders as. Resolved on the server so no client ever
// branches on source: the chip gets an icon, a label and a color, and doesn't
// care whether they came from a team row or the flair's own columns.
export type FlairDisplay = {
	icon: string
	label: string
	color: string
}

// Only used when a team flair's team is missing, which the schema's foreign
// key makes impossible in practice. Renders as a plain neutral chip rather
// than throwing - a broken cosmetic shouldn't take a leaderboard down with it.
const FALLBACK: FlairDisplay = { icon: "?", label: "Unknown", color: "#6B7280" }

type TeamFields = { abbreviation: string; name: string; color: string } | null

// `team` must be the flair's own team row, already loaded. It's a parameter
// rather than a lookup so the GraphQL layer can batch one teams query per
// request instead of one per chip.
export function flairDisplay(flair: Flair, team: TeamFields): FlairDisplay {
	return (
		match(flair.source)
			.with("team", () =>
				team
					? { icon: team.abbreviation, label: team.name, color: team.color }
					: FALLBACK,
			)
			// Everything that isn't a team carries its own display columns, filled
			// in by the catalog sync or by whoever authored it.
			.with("achievement", "group", "purchase", () => ({
				icon: flair.icon ?? FALLBACK.icon,
				label: flair.label ?? FALLBACK.label,
				color: flair.color ?? FALLBACK.color,
			}))
			.exhaustive()
	)
}
