import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { ProgressBar } from "#/components/ui/progress-bar"
import { Tag } from "#/components/ui/tag"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { isRateStat } from "#/lib/field-signal"
import { buildQuestionSlug } from "#/lib/slug"
import { groupSplit, locksInLabel } from "#/lib/still-open"

export const StillOpenRowFragment = graphql(`
	fragment StillOpenRow_entry on GroupStillOpenQuestion {
		memberCount
		medianGuess
		picks {
			optionId
			count
		}
		question {
			id
			title
			locksAt
			numericToleranceAbsolute
			league {
				id
				abbreviation
			}
			stat {
				id
				toleranceTier {
					id
					toleranceMode
					toleranceValue
				}
			}
			options {
				id
				label
			}
		}
	}
`)

const metaText = css({ textStyle: "meta", color: "fg.muted" })

// One open question at rail width, in three lines: the question, then its
// league, when it locks and how many members are in, then where they landed.
// The whole row leads to the question, where the call is made.
export function StillOpenRow({
	entry: entryRef,
}: {
	entry: FragmentType<typeof StillOpenRowFragment>
}) {
	const entry = useFragment(StillOpenRowFragment, entryRef)
	const { question } = entry
	const split = groupSplit({
		memberCount: entry.memberCount,
		picks: entry.picks,
		medianGuess: entry.medianGuess ?? null,
		options: question.options,
		rateStat: isRateStat(question),
	})

	return (
		<Link
			to="/questions/$questionId/{-$slug}"
			params={{
				questionId: question.id,
				slug: buildQuestionSlug(question.title),
			}}
			className={css({
				display: "block",
				textDecoration: "none",
				color: "inherit",
				paddingBlock: "2",
				paddingInline: "2",
				marginInline: "-2",
				borderRadius: "md",
				_hover: { bg: "bg.subtle" },
			})}
		>
			<VStack alignItems="stretch" gap="1">
				<span
					className={css({
						fontSize: "sm",
						fontWeight: "medium",
						lineClamp: 2,
					})}
				>
					{question.title}
				</span>
				<HStack gap="2" minWidth="0">
					{question.league && (
						<Tag size="sm">{question.league.abbreviation}</Tag>
					)}
					<span
						className={css({
							textStyle: "meta",
							color: "primary.default",
							whiteSpace: "nowrap",
						})}
					>
						{locksInLabel(question.locksAt)}
					</span>
					<span className={metaText}>{entry.memberCount} in</span>
				</HStack>
				{split &&
					match(split)
						.with({ kind: "sides" }, ({ first, second }) => (
								<VStack alignItems="stretch" gap="1">
									<span className={css({ textStyle: "meta", truncate: true })}>
										{first.label} {first.count} · {second.label} {second.count}
									</span>
									<ProgressBar
										value={first.count}
										max={first.count + second.count}
									/>
								</VStack>
						))
						.with({ kind: "leader" }, { kind: "median" }, ({ text }) => (
							<span className={css({ textStyle: "meta", truncate: true })}>
								{text}
							</span>
						))
						.exhaustive()}
			</VStack>
		</Link>
	)
}
