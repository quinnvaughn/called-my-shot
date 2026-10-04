import { Link } from "@tanstack/react-router"
import { buildGameTweet, GameShareRow } from "#/components/games/game-share-row"
import {
	QuestionSetRail,
	type QuestionSetRailRow,
	questionSetRailSummary,
	railHeadingClass,
	railHeadingLinkClass,
} from "#/components/questions/question-set-rail"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type { GameStatus } from "#/graphql/generated/graphql"
import { ballotMemberState } from "#/lib/ballot-member-state"
import { pickSummary } from "#/lib/call-summary"
import { isRateStat } from "#/lib/field-signal"
import { gameEntryPath } from "#/lib/game-entry"
import { gameSetRailLabel, liveStanding } from "#/lib/game-set-rail"
import { officialQuestionSequence } from "#/lib/official-game-questions"

export const GameSetRailFragment = graphql(`
	fragment GameSetRail_question on Question {
		id
		title
		shape
		status
		createdAt
		locksAt
		ouLine
		numericActualValue
		numericToleranceAbsolute
		stat {
			id
			name
			toleranceTier {
				id
				toleranceMode
				toleranceValue
			}
		}
		subjectTeam {
			id
			abbreviation
		}
		subjectPlayer {
			id
			name
		}
		options {
			id
			label
		}
		liveReading {
			value
			updatedAt
			optionValues {
				optionId
				value
			}
		}
		viewerCall {
			id
			guessValue
			conviction
			totalPoints
			hitTolerance
			payout {
				winLow
				winHigh
				lose
			}
			selections {
				id
				conviction
				option {
					id
					label
					isCorrect
				}
			}
		}
	}
`)

type Props = {
	game: {
		id: string
		status: GameStatus
		awayTeam: { abbreviation: string }
		homeTeam: { abbreviation: string }
	}
	questions: FragmentType<typeof GameSetRailFragment>[]
	// Null when signed out.
	username: string | null
	// The question on screen, when the rail sits beside one.
	currentQuestionId?: string
	// Where the matchup in the header links. Absent on the game page itself,
	// where it would only link to where you already are.
	gameLinkParams?: { gameId: string; slug: string }
}

// A game's official questions beside the game page and each of its
// questions, in place of GameStrip from xl up. While the game is on, each
// pick also says where it stands from the live box score. Polling is the
// page's job: this reads the same cache entries it refreshes.
export function GameSetRail({
	game,
	questions: questionProps,
	username,
	currentQuestionId,
	gameLinkParams,
}: Props) {
	const questions = useFragment(GameSetRailFragment, questionProps)
	const rows = officialQuestionSequence([...questions]).map(
		({ section, question }): QuestionSetRailRow => {
			const call = question.viewerCall
			return {
				questionId: question.id,
				questionTitle: question.title,
				questionStatus: question.status,
				locksAt: question.locksAt,
				label: gameSetRailLabel(question),
				section,
				state: ballotMemberState(question, call),
				call: call
					? {
							pick: pickSummary({ ...call, question }),
							totalPoints: call.totalPoints,
							payout: call.payout ?? null,
						}
					: null,
				live: call
					? liveStanding({
							shape: question.shape,
							reading: question.liveReading,
							pickedOptionIds: call.selections.map((s) => s.option.id),
							isRate: isRateStat(question),
						})
					: null,
			}
		},
	)
	const summary = questionSetRailSummary(rows)
	const matchup = `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`
	const isLive = game.status === "LIVE"

	return (
		<QuestionSetRail
			heading={
				gameLinkParams ? (
					<Link
						to="/games/$gameId/{-$slug}"
						params={gameLinkParams}
						className={railHeadingLinkClass}
					>
						{matchup} →
					</Link>
				) : (
					<h2 className={railHeadingClass}>Your calls</h2>
				)
			}
			isLive={isLive}
			rows={rows}
			username={username}
			signedOutText={
				rows.some((r) => r.state === "uncalled")
					? "Sign in to call this game. Your picks show up here and track live once it starts."
					: "Sign in to see your calls and how they did."
			}
			currentQuestionId={currentQuestionId}
			statsAsOf={isLive ? latestReading(questions) : null}
			picksPath={username ? gameEntryPath(game.id, username) : null}
			share={
				username && (
					<GameShareRow
						gameId={game.id}
						username={username}
						shareTitle={`@${username}'s ${matchup} picks`}
						surface={currentQuestionId ? "question_strip" : "game_page"}
						layout="icons"
						tweetText={buildGameTweet({ matchup, ...summary, isOwn: true })}
					/>
				)
			}
		/>
	)
}

function latestReading(
	questions: readonly { liveReading: { updatedAt: string } | null }[],
): string | null {
	return (
		questions
			.flatMap((q) => (q.liveReading ? [q.liveReading.updatedAt] : []))
			.sort()
			.at(-1) ?? null
	)
}
