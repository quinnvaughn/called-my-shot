import { BASE_POINTS_BY_SHAPE } from "@called-my-shot/scoring"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import {
	MULTI_AWARD_LOSS,
	missCost,
	NUMERIC_LOSS,
	SEASON_LEADER_LOSS,
	SINGLE_AWARD_LOSS,
} from "#/lib/how-it-works-examples"

const QUESTION_TYPES = [
	{
		title: "Stat lines & yes/no",
		pts: `${BASE_POINTS_BY_SHAPE.yes_no_prop} pts`,
		desc: "A player or team stat line, a game total, a head-to-head comparison, a yes/no proposition: one pick between two (or a few named) options.",
	},
	{
		title: "Award finalists",
		pts: `${BASE_POINTS_BY_SHAPE.player_award_finalists} pts`,
		desc: "The real announced shortlist for an award: pick the winner once the field's narrowed to a handful of named people. A miss costs a share sized so a pick at random among the finalists comes out slightly ahead.",
	},
	{
		title: "Numeric guesses",
		pts: `${BASE_POINTS_BY_SHAPE.player_stat_numeric_guess} pts`,
		desc: `Guess an exact number for a player or team stat, one game at a time. Landing within the tolerance band still counts as a hit. A miss costs ${missCost(NUMERIC_LOSS)}.`,
	},
	{
		title: "Stat leaders",
		pts: `${BASE_POINTS_BY_SHAPE.player_game_stat_leader} pts`,
		desc: `Pick who leads a game or a season in a stat, from the full roster. A game leader miss costs a share of what you committed, sized per stat so picking the player with the best season average comes out slightly ahead. A season leader miss costs ${missCost(SEASON_LEADER_LOSS)}.`,
	},
	{
		title: "Season-long awards",
		pts: `${BASE_POINTS_BY_SHAPE.player_season_award} pts / pick`,
		desc: `MVP, a championship, an All-league team: pick from the full league before the field's known, and each pick is scored at full value on its own, not a split pool. A single-pick award miss costs ${missCost(SINGLE_AWARD_LOSS)}, a title miss costs a share sized per league so picking the best record comes out slightly ahead, and each wrong pick on an award with several picks costs ${missCost(MULTI_AWARD_LOSS)}.`,
	},
]

export function TypeGrid() {
	return (
		<div
			className={css({
				display: "grid",
				gridTemplateColumns: { base: "1fr", sm: "1fr 1fr" },
				gap: "2.5",
			})}
		>
			{QUESTION_TYPES.map((t) => (
				<VStack
					key={t.title}
					alignItems="stretch"
					gap="1"
					className={css({
						background: "bg.canvas",
						border: "1px solid {colors.border.default}",
						borderRadius: "md",
						padding: "3",
					})}
				>
					<HStack justify="space-between" gap="2">
						<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
							{t.title}
						</span>
						<span
							className={css({
								textStyle: "meta",
								color: "fg.subtle",
								whiteSpace: "nowrap",
								flexShrink: 0,
							})}
						>
							{t.pts}
						</span>
					</HStack>
					<span
						className={css({
							fontSize: "xs",
							lineHeight: "relaxed",
							color: "fg.subtle",
						})}
					>
						{t.desc}
					</span>
				</VStack>
			))}
		</div>
	)
}
