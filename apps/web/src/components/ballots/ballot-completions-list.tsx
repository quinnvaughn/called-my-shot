import { Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
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
				avatarUrl
			}
		}
	}
`)

type Props = {
	summary: FragmentType<typeof BallotCompletionsListFragment>
	ballotSlug: string
}

// The ballot detail page's "who else has finished this" list - recent
// completers plus a total count, both from BallotRef.completions (the
// viewer's own completion is already excluded server-side). Each row opens
// that person's picks.
export function BallotCompletionsList({
	summary: summaryProp,
	ballotSlug,
}: Props) {
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
					<Link
						key={completion.user.id}
						to="/ballots/$ballotSlug/$username"
						params={{ ballotSlug, username: completion.user.username }}
						className={css({
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							gap: "2",
							padding: "3",
							borderBottom: "1px solid {colors.border.default}",
							_hover: { backgroundColor: "bg.subtle" },
							_last: { borderBottom: others > 0 ? undefined : "none" },
						})}
					>
						<div className={css({ flex: "1", minWidth: "0" })}>
							<Identity
								name={completion.user.name}
								username={completion.user.username}
								avatarUrl={completion.user.avatarUrl}
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
					</Link>
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
