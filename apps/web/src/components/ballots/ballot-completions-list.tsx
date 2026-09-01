import { DateTime } from "luxon"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { Identity } from "#/components/ui/identity"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { pluralize } from "#/lib/pluralize"

export const BallotCompletionsListFragment = graphql(`
	fragment BallotCompletionsList_summary on BallotCompletionSummary {
		count
		recent {
			completedAt
			user {
				id
				name
				username
			}
		}
	}
`)

type Props = {
	summary: FragmentType<typeof BallotCompletionsListFragment>
}

// The ballot detail page's "who else has finished this" list - recent
// completers plus a total count, both from BallotRef.completions (the
// viewer's own completion is already excluded server-side).
export function BallotCompletionsList({ summary: summaryProp }: Props) {
	const summary = useFragment(BallotCompletionsListFragment, summaryProp)

	if (summary.count === 0) {
		return (
			<Card>
				<Card.Body>
					<span
						className={css({
							fontSize: "sm",
							color: "fg.subtle",
							textAlign: "center",
							display: "block",
						})}
					>
						Nobody else has finished this ballot yet.
					</span>
				</Card.Body>
			</Card>
		)
	}

	const others = summary.count - summary.recent.length

	return (
		<Card>
			<VStack gap="0" alignItems="stretch">
				{summary.recent.map((completion) => (
					<HStack
						key={completion.user.id}
						justify="space-between"
						gap="2"
						className={css({
							padding: "3",
							borderBottom: "1px solid {colors.border.default}",
							_last: { borderBottom: others > 0 ? undefined : "none" },
						})}
					>
						<div className={css({ flex: "1", minWidth: "0" })}>
							<Identity
								name={completion.user.name}
								username={completion.user.username}
							/>
						</div>
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								color: "fg.subtle",
								flexShrink: "0",
							})}
						>
							{DateTime.fromISO(completion.completedAt).toRelative()}
						</span>
					</HStack>
				))}
				{others > 0 && (
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							color: "fg.subtle",
							textTransform: "uppercase",
							textAlign: "center",
							padding: "3",
						})}
					>
						And {others} {pluralize(others, "other")} have filled this ballot
					</span>
				)}
			</VStack>
		</Card>
	)
}
