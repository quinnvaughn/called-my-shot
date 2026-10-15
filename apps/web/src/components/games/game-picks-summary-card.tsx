import { Link } from "@tanstack/react-router"
import { BallotEntrySummaryCard } from "#/components/ballots/ballot-entry-summary-card"
import { arrowLink } from "#/components/ui/arrow-link"
import { button } from "#/components/ui/button"
import type { GameEntryQuery } from "#/graphql/generated/graphql"
import { buildGameTweet, GameShareRow } from "./game-share-row"

type Game = NonNullable<GameEntryQuery["game"]>
type Entry = NonNullable<Game["entry"]>

export function GamePicksSummaryCard({
	game,
	entry,
	matchup,
	gameParams,
	isOwn,
	isOpen,
	hasOpenCalls,
}: {
	game: Game
	entry: Entry
	matchup: string
	gameParams: { gameId: string; slug: string }
	isOwn: boolean
	isOpen: boolean
	hasOpenCalls: boolean
}) {
	return (
		<BallotEntrySummaryCard
			person={entry.user}
			calledCount={entry.calledCount}
			memberCount={entry.members.length}
			wins={entry.wins}
			losses={entry.losses}
			points={entry.points}
			isOpen={isOpen}
			verdict={entry.verdict}
			splits={
				entry.community.calledCount > 0
					? { official: entry.official, community: entry.community }
					: null
			}
			footer={
				<>
					<Link
						to="/games/$gameId/{-$slug}"
						params={gameParams}
						className={arrowLink({ tone: "primary", align: "parent" })}
					>
						{isOwn ? "Back to the game →" : "Make your own calls →"}
					</Link>
					{/* Their picks still open to call against, as a ready-made
					    challenge they can trim or add to. */}
					{isOwn && hasOpenCalls && (
						<Link
							to="/challenges/new"
							search={{ game: game.id, source: "game_picks" }}
							className={button({ variant: "solid", size: "sm" })}
						>
							Challenge with these picks
						</Link>
					)}
					<GameShareRow
						gameId={game.id}
						username={entry.user.username}
						shareTitle={`@${entry.user.username}'s ${matchup} picks`}
						surface="entry_page"
						layout="icons"
						tweetText={buildGameTweet({
							matchup,
							calledCount: entry.calledCount,
							questionCount: entry.members.length,
							wins: entry.wins,
							losses: entry.losses,
							points: entry.points,
							...(isOwn
								? ({ isOwn: true } as const)
								: ({ isOwn: false, username: entry.user.username } as const)),
						})}
					/>
				</>
			}
		/>
	)
}
