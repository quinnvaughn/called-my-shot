import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { FieldHint } from "#/components/ui/field-hint"
import type { EntitySearchItem } from "./entity-search-field"

type Props = {
	items: EntitySearchItem[]
	// The conference/division (and, for player awards, position) the pool's
	// been narrowed to, joined for display - "AL East", "AL" - empty for the
	// unscoped whole-league default.
	scopeLabel?: string
	// player_season_award only - whether awardRookieOnly narrowed the pool to
	// rookie-eligible players. Kept as its own prop rather than folded into
	// scopeLabel - unlike a conference/division/position, "rookie-eligible"
	// doesn't read naturally as "every player in rookie-eligible", so it needs
	// its own clause instead of just joining into that string.
	rookieOnly?: boolean
}

// player_season_award/team_season_award's pool - the full league roster by
// default, optionally narrowed to a conference/division/position (see the
// picker fields above this in shape-panels/award-panel.tsx) for awards that are
// genuinely scoped in reality (AL MVP vs NL MVP) rather than hand-curated row
// by row - nobody's hand-searching and adding hundreds of players one at a
// time. Display only: the whole list is what submits as `options` (see
// useCreateQuestionForm).
export function PoolSummary({ items, scopeLabel, rookieOnly }: Props) {
	if (items.length === 0) {
		return <FieldHint>Pick a league to see the pool.</FieldHint>
	}

	const noun = items[0]?.kind === "player" ? "players" : "teams"

	return (
		<HStack
			justify="space-between"
			className={css({
				bg: "bg.canvas",
				border: "1px solid {colors.border.default}",
				borderRadius: "lg",
				paddingBlock: "2.5",
				paddingInline: "3.5",
			})}
		>
			<span
				className={css({
					textStyle: "label",
					color: "fg.subtle",
				})}
			>
				Pool
			</span>
			<span
				className={css({
					fontFamily: "heading",
					fontSize: "sm",
					color: "primary.default",
				})}
			>
				every {noun.slice(0, -1)} in {scopeLabel || "the league"}
				{rookieOnly ? ", rookie-eligible" : ""} ({items.length})
			</span>
		</HStack>
	)
}
