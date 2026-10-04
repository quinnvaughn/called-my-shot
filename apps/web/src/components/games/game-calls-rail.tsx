import { Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import type { ReactNode } from "react"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { buildGameTweet, GameShareRow } from "#/components/games/game-share-row"
import { LockLine } from "#/components/questions/lock-line"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type {
	GameCallsRail_QuestionFragment,
	GameStatus,
} from "#/graphql/generated/graphql"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import { ballotMemberState } from "#/lib/ballot-member-state"
import { formatPayout, pickSummary } from "#/lib/call-summary"
import { isRateStat } from "#/lib/field-signal"
import {
	gameCallsRailLabel,
	liveStanding,
	type RailTone,
} from "#/lib/game-calls-rail"
import { gameEntryPath, viewerGamePicksSummary } from "#/lib/game-entry"
import { officialQuestionSequence } from "#/lib/official-game-questions"
import { questionDetailState } from "#/lib/question-detail-state"
import { buildQuestionSlug } from "#/lib/slug"
import { openModal } from "#/stores/modal-store"

export const GameCallsRailFragment = graphql(`
	fragment GameCallsRail_question on Question {
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

type RailQuestion = GameCallsRail_QuestionFragment

type Props = {
	game: {
		id: string
		status: GameStatus
		awayTeam: { abbreviation: string }
		homeTeam: { abbreviation: string }
	}
	questions: FragmentType<typeof GameCallsRailFragment>[]
	// Null when signed out.
	username: string | null
}

const labelBase = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
})

const labelClass = cx(labelBase, css({ color: "fg.muted" }))

const subtleLabelClass = cx(
	labelBase,
	css({ color: "fg.subtle", whiteSpace: "nowrap" }),
)

const monoSmall = css({
	fontFamily: "mono",
	fontSize: "xs",
	color: "fg.subtle",
})

const TONE_COLOR: Record<RailTone, string> = {
	success: css({ color: "success.default" }),
	danger: css({ color: "danger.default" }),
	muted: css({ color: "fg.subtle" }),
	default: css({ color: "fg.default" }),
}

// The viewer's own calls on a game's official questions, beside the game
// page. Before the game it's what they've called and what's still open;
// while it's on, where each pick stands from the live box score; after,
// their record and points. Polling is the page's job: this reads the same
// cache entries it refreshes.
export function GameCallsRail({ game, questions: questionProps, username }: Props) {
	const questions = useFragment(GameCallsRailFragment, questionProps)
	const sequence = officialQuestionSequence([...questions]).map(
		(e) => e.question,
	)
	const called = sequence.filter((q) => q.viewerCall !== null)
	const summary = viewerGamePicksSummary(sequence)
	const openUncalled = sequence.filter(
		(q) => q.viewerCall === null && questionDetailState(q).canCall,
	)
	const settledCount = summary.wins + summary.losses
	const matchup = `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`

	return (
		<VStack gap="3" alignItems="stretch">
			<HStack justify="space-between" alignItems="baseline" gap="3">
				<h2 className={labelClass}>Your calls</h2>
				{game.status === "LIVE" && <LiveTag />}
			</HStack>

			{!username ? (
				<SignedOut openCount={openUncalled.length} />
			) : (
				<>
					<Summary
						calledCount={summary.calledCount}
						questionCount={summary.questionCount}
						wins={summary.wins}
						losses={summary.losses}
						points={summary.points}
						showRecord={settledCount > 0}
					/>

					{called.length > 0 ? (
						<Card variant="surface">
							<VStack gap="0" alignItems="stretch">
								{called.map((question, i) => (
									<RailRow
										key={question.id}
										question={question}
										divider={i > 0}
									/>
								))}
							</VStack>
						</Card>
					) : (
						<p className={css({ fontSize: "sm", color: "fg.muted" })}>
							{openUncalled.length > 0
								? "Nothing called yet. Your picks show up here and track live once the game starts."
								: "You didn't call this game."}
						</p>
					)}

					<RailFooter
						gameStatus={game.status}
						openUncalled={openUncalled}
						updatedAt={latestReading(called)}
					/>

					{called.length > 0 && (
						<HStack justify="space-between" gap="3">
							<Link
								to={gameEntryPath(game.id, username)}
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									letterSpacing: "wide",
									textTransform: "uppercase",
									color: "primary.default",
									textDecoration: "none",
									_hover: { opacity: 0.8 },
								})}
							>
								Your picks page →
							</Link>
							<GameShareRow
								gameId={game.id}
								username={username}
								shareTitle={`@${username}'s ${matchup} picks`}
								surface="game_page"
								layout="icons"
								tweetText={buildGameTweet({ matchup, ...summary, isOwn: true })}
							/>
						</HStack>
					)}
				</>
			)}
		</VStack>
	)
}

function LiveTag() {
	return (
		<HStack gap="1.5" alignItems="center">
			<span
				className={css({
					width: "1.5",
					height: "1.5",
					borderRadius: "full",
					bg: "secondary.default",
					animation: "pulse 1.6s ease-in-out infinite",
				})}
			/>
			<span
				className={cx(
					labelBase,
					css({ color: "fg.default", fontWeight: "bold" }),
				)}
			>
				Live
			</span>
		</HStack>
	)
}

// The record and points once anything has settled, the called count before.
function Summary({
	calledCount,
	questionCount,
	wins,
	losses,
	points,
	showRecord,
}: {
	calledCount: number
	questionCount: number
	wins: number
	losses: number
	points: number
	showRecord: boolean
}) {
	if (questionCount === 0) return null
	return (
		<HStack gap="4" alignItems="baseline">
			{showRecord ? (
				<>
					<SummaryStat value={formatRecord(wins, losses)} label="Record" />
					<SummaryStat
						value={formatSignedPoints(points)}
						label="Points"
						tone={points >= 0 ? "success" : "danger"}
					/>
				</>
			) : (
				<SummaryStat
					value={`${calledCount} of ${questionCount}`}
					label="Called"
				/>
			)}
		</HStack>
	)
}

function SummaryStat({
	value,
	label,
	tone = "default",
}: {
	value: string
	label: string
	tone?: RailTone
}) {
	return (
		<VStack gap="0.5" alignItems="flex-start">
			<span
				className={cx(
					css({
						fontFamily: "mono",
						fontSize: "2xl",
						fontWeight: "bold",
						lineHeight: "1",
					}),
					TONE_COLOR[tone],
				)}
			>
				{value}
			</span>
			<span className={subtleLabelClass}>{label}</span>
		</VStack>
	)
}

function RailRow({
	question,
	divider,
}: {
	question: RailQuestion
	divider: boolean
}) {
	const call = question.viewerCall
	if (!call) return null
	const state = ballotMemberState(question, call)
	const pick = pickSummary({ ...call, question })

	return (
		<Link
			to="/questions/$questionId/{-$slug}"
			params={{
				questionId: question.id,
				slug: buildQuestionSlug(question.title),
			}}
			className={css({
				display: "block",
				paddingBlock: "3",
				paddingInline: "4",
				textDecoration: "none",
				color: "inherit",
				borderTop: divider ? "1px solid {colors.border.default}" : "none",
				_hover: { bg: "bg.subtle" },
			})}
		>
			<HStack justify="space-between" alignItems="flex-start" gap="3">
				<VStack gap="0.5" alignItems="flex-start" minWidth="0">
					<span
						className={css({
							fontSize: "sm",
							fontWeight: "semibold",
							color: "fg.default",
						})}
					>
						{gameCallsRailLabel(question)}
					</span>
					<span className={monoSmall}>{pick}</span>
				</VStack>
				<RowStanding question={question} call={call} state={state} />
			</HStack>
		</Link>
	)
}

function RowStanding({
	question,
	call,
	state,
}: {
	question: RailQuestion
	call: NonNullable<RailQuestion["viewerCall"]>
	state: ReturnType<typeof ballotMemberState>
}) {
	if (state === "won" || state === "lost") {
		const points = call.totalPoints ?? 0
		return (
			<StandingCell
				value={formatSignedPoints(points)}
				detail={state === "won" ? "Hit" : "Missed"}
				tone={points >= 0 ? "success" : "danger"}
			/>
		)
	}
	if (state === "voided") {
		return <StandingCell value="Void" detail="No points" tone="muted" />
	}

	const live = liveStanding({
		shape: question.shape,
		reading: question.liveReading,
		pickedOptionIds: call.selections.map((s) => s.option.id),
		isRate: isRateStat(question),
	})
	if (live) return <StandingCell {...live} />

	if (question.status === "OPEN" && call.payout) {
		const payout = formatPayout(call.payout)
		return (
			<StandingCell
				value={
					<>
						<span className={TONE_COLOR.success}>{payout.win}</span>
						<span className={TONE_COLOR.muted}> / </span>
						<span className={TONE_COLOR.danger}>{payout.lose}</span>
					</>
				}
				detail="If right / wrong"
				tone="default"
			/>
		)
	}
	return null
}

function StandingCell({
	value,
	detail,
	tone,
}: {
	value: ReactNode
	detail: string
	tone: RailTone
}) {
	return (
		<VStack gap="0.5" alignItems="flex-end" flexShrink="0">
			<span
				className={cx(
					css({
						fontFamily: "mono",
						fontSize: "sm",
						fontWeight: "bold",
						whiteSpace: "nowrap",
					}),
					TONE_COLOR[tone],
				)}
			>
				{value}
			</span>
			<span className={subtleLabelClass}>{detail}</span>
		</VStack>
	)
}

// Before the game, how much is still open and when it locks. During it, how
// fresh the live numbers are, since they trail the game by a few minutes.
function RailFooter({
	gameStatus,
	openUncalled,
	updatedAt,
}: {
	gameStatus: GameStatus
	openUncalled: RailQuestion[]
	updatedAt: string | null
}) {
	const firstLock = openUncalled
		.map((q) => q.locksAt)
		.sort()
		.at(0)

	if (gameStatus === "SCHEDULED" && openUncalled.length > 0 && firstLock) {
		return (
			<span className={monoSmall}>
				{openUncalled.length} still open ·{" "}
				<LockLine status="OPEN" locksAt={firstLock} />
			</span>
		)
	}
	if (gameStatus === "LIVE" && updatedAt) {
		return (
			<span className={monoSmall}>
				Stats as of {DateTime.fromISO(updatedAt).toFormat("h:mm a")}
			</span>
		)
	}
	return null
}

function latestReading(questions: RailQuestion[]): string | null {
	return (
		questions
			.flatMap((q) => (q.liveReading ? [q.liveReading.updatedAt] : []))
			.sort()
			.at(-1) ?? null
	)
}

function SignedOut({ openCount }: { openCount: number }) {
	return (
		<VStack gap="3" alignItems="flex-start">
			<p className={css({ fontSize: "sm", color: "fg.muted" })}>
				{openCount > 0
					? "Sign in to call this game. Your picks show up here and track live once it starts."
					: "Sign in to see your calls and how they're doing."}
			</p>
			<Button
				size="sm"
				variant="solid"
				onClick={() => openModal(<AuthModal defaultView="signin" />)}
			>
				Sign in
			</Button>
		</VStack>
	)
}
