import { cva } from "styled-system/css"
import { TeamBadge } from "#/components/ui/team-badge"

const chip = cva({
	base: {
		display: "inline-flex",
		alignItems: "center",
		gap: "2",
		padding: "{spacing.1} {spacing.2.5} {spacing.1} {spacing.1}",
		borderRadius: "full",
		fontSize: "xs",
		fontWeight: "medium",
	},
	variants: {
		outcome: {
			CLOSE: {
				bg: "warning.subtle",
				color: "warning.default",
				border: "1px solid {colors.warning.default}",
			},
			MISS: {
				bg: "danger.subtle",
				color: "danger.default",
				border: "1px solid {colors.danger.default}",
			},
		},
	},
})

// One wrong guess and what it told you: whether the franchise was right, and
// which way the season is.
export function GuessChip({
	team,
	label,
	name,
	outcome,
	direction,
}: {
	team: {
		abbreviation: string
		color: string
		logoUrl?: string | null
	}
	label: string
	name: string
	outcome: "CLOSE" | "MISS"
	direction: "EARLIER" | "LATER" | null
}) {
	return (
		<span className={chip({ outcome })}>
			<TeamBadge
				abbreviation={team.abbreviation}
				color={team.color}
				logoUrl={team.logoUrl}
			/>
			{label} {name} · {outcome === "MISS" ? "wrong team" : "right team"} ·{" "}
			{direction === "EARLIER"
				? "← earlier"
				: direction === "LATER"
					? "later →"
					: "right year"}
		</span>
	)
}
