import { Link } from "@tanstack/react-router"
import { buildGameTweet, GameShareRow } from "#/components/games/game-share-row"
import { QuestionSetRail } from "#/components/questions/question-set-rail/question-set-rail"
import {
	railHeadingClass,
	railHeadingLinkClass,
} from "#/components/questions/question-set-rail/rail-styles"
import { button } from "#/components/ui/button"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type {
	GameSetRail_QuestionFragment,
	GameStatus,
} from "#/graphql/generated/graphql"
import { ballotMemberState } from "#/lib/ballot-member-state"
import { pickSummary } from "#/lib/call-summary"
import { isRateStat } from "#/lib/field-signal"
import { gameEntryPath } from "#/lib/game-entry"
import { gameSetRailLabel, liveStanding } from "#/lib/game-set-rail"
import { matchupLabel } from "#/lib/game-status"
import { officialQuestionSequence } from "#/lib/official-game-questions"
import {
	type QuestionSetRailRow,
	questionSetRailSummary,
} from "#/lib/question-set-rail"

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
	// The community questions on the game the viewer called, behind their own
	// tab. Absent where the page doesn't ask for them.
	communityQuestions?: FragmentType<typeof GameSetRailFragment>[]
	// Null when signed out.
	username: string | null
	// The question on screen, when the rail sits beside one.
	currentQuestionId?: string
	// Where the matchup in the header links. Absent on the game page itself,
	// where it would only link to where you already are.
	gameLinkParams?: { gameId: string; slug: string }
}

// A game's official questions beside the game page and each of its
// questions (a sheet from RailTab below xl), with the community questions
// the viewer called behind a second tab. While the game is on, each
// pick also says where it stands from the live box score. Polling is the
// page's job: this reads the same cache entries it refreshes.
export function GameSetRail({
	game,
	questions: questionProps,
	communityQuestions: communityProps = [],
	username,
	currentQuestionId,
	gameLinkParams,
}: Props) {
	const questions = useFragment(GameSetRailFragment, questionProps)
	const communityQuestions = useFragment(GameSetRailFragment, communityProps)
	const rows = officialQuestionSequence([...questions]).map(
		({ section, question }) =>
			railRow(question, section, gameSetRailLabel(question)),
	)
	// A community yes/no question has no stat to name, and its chip is only
	// the subject, so it goes by the title its creator wrote.
	const communityRows = communityQuestions.map((question) =>
		railRow(
			question,
			null,
			question.shape === "YES_NO_PROP"
				? question.title
				: gameSetRailLabel(question),
		),
	)
	const summary = questionSetRailSummary(rows, communityRows)
	const matchup = matchupLabel(game)
	const isLive = game.status === "LIVE"
	const now = new Date()
	const openRows = rows.filter(
		(r) => r.questionStatus === "OPEN" && new Date(r.locksAt) > now,
	)
	const openCount = openRows.length
	const openPicks = openRows.filter((r) => r.state === "pending").length

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
			statsAsOf={
				isLive ? latestReading([...questions, ...communityQuestions]) : null
			}
			extraTab={{
				setLabel: "Official",
				extraLabel: "Community",
				rows: communityRows,
			}}
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
			// Any game still open can be a challenge. With picks still open on
			// it they come ready-made; without, the builder opens on the game's
			// questions to pick from.
			action={
				username &&
				openCount > 0 && (
					<Link
						to="/challenges/new"
						search={{
							game: game.id,
							source: openPicks > 0 ? "game_picks" : "game",
						}}
						className={button({
							variant: "dark",
							size: "sm",
							fullWidth: true,
						})}
					>
						Start a challenge
					</Link>
				)
			}
		/>
	)
}

function railRow(
	question: GameSetRail_QuestionFragment,
	section: string | null,
	label: string,
): QuestionSetRailRow {
	const call = question.viewerCall
	return {
		questionId: question.id,
		questionTitle: question.title,
		questionStatus: question.status,
		locksAt: question.locksAt,
		label,
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
