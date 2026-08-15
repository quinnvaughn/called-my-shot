import { useEffect } from "react"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { FieldHint } from "#/components/ui/field-hint"
import type { EntitySearchItem } from "./entity-search-field"
import type { CreateQuestionFormApi } from "./form-types"

type Props = {
	form: CreateQuestionFormApi
	items: EntitySearchItem[]
}

// Multi-select's pool, when the category has a fixed vocabulary (teams or
// players) - the pool just *is* the whole vocabulary, not something worth
// curating row by row (an All-League-Team pick draws from every player in
// the league; nobody's hand-searching and adding hundreds of them one at a
// time). Syncs the full list into `options` automatically. OptionList only
// takes over for category "Other", which has no vocabulary to derive a
// pool from in the first place.
export function PoolSummary({ form, items }: Props) {
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
				every {noun.slice(0, -1)} in the league ({items.length})
			</span>
		</HStack>
	)
}
