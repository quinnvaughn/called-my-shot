import { css, cva } from "styled-system/css"
import { TeamBadge } from "#/components/ui/team-badge"

export type GuessTeam = {
	id: string
	name: string
	abbreviation: string
	color: string
	logoUrl?: string | null
}

const button = cva({
	base: {
		display: "flex",
		alignItems: "center",
		gap: "3",
		width: "full",
		minWidth: 0,
		padding: "{spacing.2.5} {spacing.3}",
		borderRadius: "lg",
		bg: "bg.surface",
		textAlign: "left",
		fontSize: "sm",
		fontWeight: "medium",
		color: "fg.default",
		cursor: "pointer",
		transition: "border-color 0.15s ease, background-color 0.15s ease",
		_hover: { bg: "bg.subtle" },
		_disabled: {
			cursor: "not-allowed",
			opacity: 0.4,
			_hover: { bg: "bg.surface" },
		},
	},
	variants: {
		selected: {
			true: { border: "1px solid {colors.primary.default}", bg: "bg.subtle" },
			false: { border: "1px solid {colors.border.default}" },
		},
		ruledOut: {
			true: { textDecoration: "line-through", color: "fg.muted" },
		},
	},
})

// One franchise to guess. Struck through once a guess has ruled it out.
export function FranchiseButton({
	team,
	selected,
	ruledOut,
	disabled,
	onSelect,
}: {
	team: GuessTeam
	selected: boolean
	ruledOut: boolean
	disabled: boolean
	onSelect: () => void
}) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			disabled={disabled || ruledOut}
			onClick={onSelect}
			className={button({ selected, ruledOut })}
		>
			<TeamBadge
				abbreviation={team.abbreviation}
				color={team.color}
				logoUrl={team.logoUrl}
			/>
			<span className={css({ truncate: true })}>{team.name}</span>
		</button>
	)
}
