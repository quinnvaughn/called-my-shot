import { MatchupList } from "#/components/challenges/matchup-list"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { Eyebrow } from "#/components/ui/eyebrow"
import type { ChallengePageQuery } from "#/graphql/generated/graphql"

type Props = {
	code: string
	matchups: NonNullable<ChallengePageQuery["challenge"]>["matchups"]
}

export function ChallengeMatchupsCard({ code, matchups }: Props) {
	return (
		<Card size="md">
			<Card.Header>
				<Eyebrow variant="neutral">{`Your 1v1s · ${matchups.length}`}</Eyebrow>
			</Card.Header>
			<Card.Body>
				{matchups.length === 0 ? (
					<EmptyState>
						Nobody's taken it on yet. Anyone you send the link to can.
					</EmptyState>
				) : (
					<MatchupList code={code} matchups={matchups} />
				)}
			</Card.Body>
		</Card>
	)
}
