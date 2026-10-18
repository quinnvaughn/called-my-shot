import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import type { ChainLinkCandidate_CandidateFragment } from "#/graphql/generated/graphql"
import { pickSummary, toCallSummary } from "#/lib/call-summary"
import { chanceLabel } from "#/lib/chains"
import { formatShortDate } from "#/lib/format-date"

type Props = {
	candidate: ChainLinkCandidate_CandidateFragment
	selected: boolean
	onSelect: () => void
}

// One of the viewer's open calls in a picker. A call that can't go in says
// why instead of being pickable.
export function EligibleCallRow({ candidate, selected, onSelect }: Props) {
	const call = candidate.call
	if (!call) return null
	const pick = pickSummary(toCallSummary(call))
	const blocked = candidate.reason !== null
	return (
		<button
			type="button"
			disabled={blocked}
			onClick={onSelect}
			aria-pressed={selected}
			className={css({
				textAlign: "left",
				padding: "3",
				borderRadius: "lg",
				bg: "bg.subtle",
				cursor: blocked ? "not-allowed" : "pointer",
				opacity: blocked ? 0.6 : 1,
				border: selected
					? "1px solid {colors.primary.default}"
					: "1px solid {colors.border.default}",
				_hover: blocked
					? {}
					: { border: "1px solid {colors.border.emphasized}" },
			})}
		>
			<VStack gap="1" alignItems="stretch">
				<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
					{call.question.title}
				</span>
				<HStack gap="2" justify="space-between" flexWrap="wrap">
					<span className={css({ fontSize: "sm" })}>{pick}</span>
					<span className={css({ textStyle: "meta", color: "fg.muted" })}>
						{candidate.hitChance !== null
							? `${chanceLabel(candidate.hitChance)} · `
							: ""}
						locks {formatShortDate(call.question.locksAt)}
					</span>
				</HStack>
				{candidate.reason && (
					<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
						{candidate.reason}
					</span>
				)}
			</VStack>
		</button>
	)
}
