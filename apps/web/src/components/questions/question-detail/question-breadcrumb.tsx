import { match, P } from "ts-pattern"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { matchupLabel } from "#/lib/game-status"
import { buildGameSlug } from "#/lib/slug"
import type { QuestionDetail } from "./types"

export function QuestionBreadcrumb({ question }: { question: QuestionDetail }) {
	const gameLinkParams = question.game
		? {
				gameId: question.game.id,
				slug: buildGameSlug({
					league: question.league,
					homeTeam: question.game.homeTeam,
					awayTeam: question.game.awayTeam,
					startsAt: question.game.startsAt,
				}),
			}
		: null
	const ballot = question.ballotMembership?.ballot ?? null

	return (
		<Breadcrumb>
			<Breadcrumb.Link
				to="/leagues/$leagueSlug"
				params={{ leagueSlug: question.league.slug }}
			>
				{question.league.abbreviation}
			</Breadcrumb.Link>
			{/* A ballot member's trail is the ballot's own (league /
		ballots / ballot) - ballots are season-award questions, so no
		member has a game crumb to show anyway. */}
			{match({ ballot, game: question.game, gameLinkParams })
				.with({ ballot: P.nonNullable }, ({ ballot }) => (
					<>
						<Breadcrumb.Link
							to="/leagues/$leagueSlug/ballots"
							params={{ leagueSlug: question.league.slug }}
						>
							Ballots
						</Breadcrumb.Link>
						<Breadcrumb.Link
							to="/ballots/$ballotSlug"
							params={{ ballotSlug: ballot.slug }}
						>
							{ballot.name}
						</Breadcrumb.Link>
					</>
				))
				.with(
					{ game: P.nonNullable, gameLinkParams: P.nonNullable },
					({ game, gameLinkParams }) => (
						<Breadcrumb.Link
							to="/games/$gameId/{-$slug}"
							params={gameLinkParams}
						>
							{matchupLabel(game)}
						</Breadcrumb.Link>
					),
				)
				.otherwise(() => null)}
			<Breadcrumb.Current>{question.title}</Breadcrumb.Current>
		</Breadcrumb>
	)
}
