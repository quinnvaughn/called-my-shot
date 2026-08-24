import { useEffect } from "react"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { FieldHint } from "#/components/ui/field-hint"
import type { EntitySearchItem } from "./entity-search-field"
import type { CreateQuestionFormApi } from "./form-types"

type Props = {
	form: CreateQuestionFormApi
	items: EntitySearchItem[]
	// The conference/division (and, for player awards, position) the pool's
	// been narrowed to, joined for display - "AL East", "AL" - empty for the
	// unscoped whole-league default.
	scopeLabel?: string
}

// player_season_award/team_season_award's pool - the full league roster by
// default, optionally narrowed to a conference/division/position (see the
// picker fields above this in create-question-form.tsx) for awards that are
// genuinely scoped in reality (AL MVP vs NL MVP) rather than hand-curated row
// by row - nobody's hand-searching and adding hundreds of players one at a
// time. Syncs the list into `options` automatically.
export function PoolSummary({ form, items, scopeLabel }: Props) {
	useEffect(() => {
		form.setValue(
			"options",
			items.map((item) => ({
				label: item.label,
				teamId: item.kind === "team" ? item.id : undefined,
				playerId: item.kind === "player" ? item.id : undefined,
			})),
		)
	}, [items, form.setValue])

	if (items.length === 0) {
		return <FieldHint>Pick a league to see the pool.</FieldHint>
	}

	const noun = items[0]?.kind === "player" ? "players" : "teams"

	return (
		<HStack
			justify="space-between"
			className={css({
				bg: "bg.canvas",
				border: "1px solid",
				borderColor: "border.default",
				borderRadius: "lg",
				paddingBlock: "2.5",
				paddingInline: "3.5",
			})}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					color: "fg.subtle",
					textTransform: "uppercase",
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
				every {noun.slice(0, -1)} in {scopeLabel || "the league"} (
				{items.length})
			</span>
		</HStack>
	)
}
