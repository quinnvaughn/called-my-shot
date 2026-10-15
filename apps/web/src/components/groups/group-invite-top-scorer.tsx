import { css } from "styled-system/css"
import { Card } from "#/components/ui/card"
import type { GroupPreviewQuery } from "#/graphql/generated/graphql"

type Preview = NonNullable<GroupPreviewQuery["groupPreview"]>

type Props = {
	topScorer: NonNullable<Preview["topScorer"]>
	trackedLeagues: Preview["trackedLeagues"]
}

export function GroupInviteTopScorer({ topScorer, trackedLeagues }: Props) {
	const topScorerLabel =
		trackedLeagues.length === 1
			? `${trackedLeagues[0].abbreviation} top scorer this season:`
			: "top scorer this season:"

	return (
		<Card size="sm" className={css({ alignSelf: "flex-start" })}>
			<Card.Body>
				<p
					className={css({
						color: "fg.muted",
						textStyle: "metaLg",
					})}
				>
					{topScorerLabel}{" "}
					<b className={css({ color: "fg.default" })}>
						{topScorer.name} (@{topScorer.username}) · {topScorer.points} pts
					</b>
				</p>
			</Card.Body>
		</Card>
	)
}
