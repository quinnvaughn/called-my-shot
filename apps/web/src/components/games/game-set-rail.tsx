import { Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import type { ReactNode } from "react"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { buildGameTweet, GameShareRow } from "#/components/games/game-share-row"
import { LockLine } from "#/components/questions/lock-line"
import { MemberStateIcon } from "#/components/questions/question-set-strip"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type {
	GameSetRail_QuestionFragment,
	GameStatus,
} from "#/graphql/generated/graphql"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import {
	type BallotMemberState,
	ballotMemberState,
} from "#/lib/ballot-member-state"
import { formatPayout, pickSummary } from "#/lib/call-summary"
import { isRateStat } from "#/lib/field-signal"
import { gameEntryPath, viewerGamePicksSummary } from "#/lib/game-entry"
import { gameSetRailLabel, liveStanding, type RailTone } from "#/lib/game-set-rail"
import { officialQuestionSequence } from "#/lib/official-game-questions"
import { questionSetNavigation } from "#/lib/question-set-navigation"
import { buildQuestionSlug } from "#/lib/slug"
import { openModal } from "#/stores/modal-store"

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

type RailQuestion = GameSetRail_QuestionFragment

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
	// The question on screen, when the rail sits beside one: it's marked, and
	// the jump to the next uncalled question counts on from it.
	currentQuestionId?: string
	// Where the matchup in the header links. Absent on the game page itself,
	// where it would only link to where you already are.
	gameLinkParams?: { gameId: string; slug: string }
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

const actionLinkClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "primary.default",
	textDecoration: "none",
	_hover: { opacity: 0.8 },
})

const TONE_COLOR: Record<RailTone, string> = {
	success: css({ color: "success.default" }),
	danger: css({ color: "danger.default" }),
	muted: css({ color: "fg.subtle" }),
	default: css({ color: "fg.default" }),
}

// One finished class per row kind, for the same reason as the strip's chip
// classes (see question-set-strip.tsx): the current row swaps the left
// border, and Panda only emits what it sees literally inside css().
const rowClass = {
	default: css({
		display: "block",
		paddingBlock: "2.5",
		paddingInline: "4",
		textDecoration: "none",
		color: "inherit",
		borderLeft: "2px solid transparent",
		_hover: { bg: "bg.subtle" },
	}),
	current: css({
		display: "block",
		paddingBlock: "2.5",
		paddingInline: "4",
		textDecoration: "none",
		color: "inherit",
		borderLeft: "2px solid {colors.secondary.default}",
		bg: "secondary.default/8",
		_hover: { bg: "secondary.default/12" },
	}),
}

// A game's official questions as one list beside the page, with the viewer's
// call on each: what's called and what's left before the game, where each
// pick stands from the live box score while it's on, the record and points
// after. Sits beside the game page and each of its questions, in place of
// GameStrip from xl up. Polling is the page's job: this reads the same cache
// entries it refreshes.
export function GameSetRail({
	game,
	questions: questionProps,
	username,
	currentQuestionId,
	gameLinkParams,
}: Props) {
	const questions = useFragment(GameSetRailFragment, questionProps)
	const sequence = officialQuestionSequence([...questions])
	const ordered = sequence.map((e) => e.question)
	if (ordered.length === 0) return null

	const states = ordered.map((q) => ballotMemberState(q, q.viewerCall))
	const currentIndex = ordered.findIndex((q) => q.id === currentQuestionId)
	const { nextUncalledIndex } = questionSetNavigation(states, currentIndex)
	const nextUncalled =
		nextUncalledIndex !== null ? ordered[nextUncalledIndex] : undefined
	const summary = viewerGamePicksSummary(ordered)
	const openUncalled = ordered.filter((_, i) => states[i] === "uncalled")
	const matchup = `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`

	return (
		<VStack gap="3" alignItems="stretch">
			<HStack justify="space-between" alignItems="baseline" gap="3">
				{gameLinkParams ? (
					<Link
						to="/games/$gameId/{-$slug}"
						params={gameLinkParams}
						className={cx(
							labelClass,
							css({
								textDecoration: "none",
								_hover: { color: "fg.default" },
							}),
						)}
					>
						{matchup} →
					</Link>
				) : (
					<h2 className={labelClass}>Your calls</h2>
				)}
				{game.status === "LIVE" && <LiveTag />}
			</HStack>

			{username ? (
				<HStack justify="space-between" alignItems="center" gap="3">
					<Summary
						calledCount={summary.calledCount}
						questionCount={summary.questionCount}
						wins={summary.wins}
						losses={summary.losses}
						points={summary.points}
					/>
					{summary.calledCount > 0 && (
						<GameShareRow
							gameId={game.id}
							username={username}
							shareTitle={`@${username}'s ${matchup} picks`}
							surface={currentQuestionId ? "question_strip" : "game_page"}
							layout="icons"
							tweetText={buildGameTweet({ matchup, ...summary, isOwn: true })}
						/>
					)}
				</HStack>
			) : (
				<SignedOut openCount={openUncalled.length} />
			)}

			<RailStatusLine
				gameStatus={game.status}
				openUncalled={openUncalled}
				updatedAt={latestReading(ordered)}
			/>

			{nextUncalled && (
				<Link
					to="/questions/$questionId/{-$slug}"
					params={{
						questionId: nextUncalled.id,
						slug: buildQuestionSlug(nextUncalled.title),
					}}
					className={actionLinkClass}
				>
					Next uncalled: {gameSetRailLabel(nextUncalled)} →
				</Link>
			)}

			<Card variant="surface">
				<VStack gap="0" alignItems="stretch" paddingBlock="1">
					{sectionRuns(sequence).map((run) => (
						<VStack key={run.label} gap="0" alignItems="stretch">
							<span
								className={cx(
									subtleLabelClass,
									css({ paddingInline: "4", paddingTop: "3", paddingBottom: "1" }),
								)}
							>
								{run.label}
							</span>
							{run.questions.map((question) => (
								<RailRow
									key={question.id}
									question={question}
									state={states[ordered.indexOf(question)] ?? "uncalled"}
									isCurrent={question.id === currentQuestionId}
								/>
							))}
						</VStack>
					))}
				</VStack>
			</Card>

			{/* After the list rather than above it: it's the same picks as a
			    page of their own, which is where you'd go having read them. */}
			{username && summary.calledCount > 0 && (
				<Link to={gameEntryPath(game.id, username)} className={actionLinkClass}>
					Your picks page →
				</Link>
			)}
		</VStack>
	)
}

// Consecutive questions under the same section label. The sequence is
// already in section order, so each label comes round once.
function sectionRuns(
	sequence: { section: string; question: RailQuestion }[],
): { label: string; questions: RailQuestion[] }[] {
	return sequence.reduce<{ label: string; questions: RailQuestion[] }[]>(
		(runs, { section, question }) => {
			const last = runs.at(-1)
			if (last && last.label === section) last.questions.push(question)
			else runs.push({ label: section, questions: [question] })
			return runs
		},
		[],
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
}: {
	calledCount: number
	questionCount: number
	wins: number
	losses: number
	points: number
}) {
	return (
		<HStack gap="5" alignItems="baseline">
			{wins + losses > 0 ? (
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
	state,
	isCurrent,
}: {
	question: RailQuestion
	state: BallotMemberState
	isCurrent: boolean
}) {
	const call = question.viewerCall

	return (
		<Link
			to="/questions/$questionId/{-$slug}"
			params={{
				questionId: question.id,
				slug: buildQuestionSlug(question.title),
			}}
			aria-current={isCurrent ? "page" : undefined}
			className={rowClass[isCurrent ? "current" : "default"]}
		>
			{/* Stacked rather than split into columns: at the rail's width a
			    column of numbers beside the label leaves the label half of it. */}
			<HStack gap="2.5" alignItems="flex-start">
				<div className={css({ paddingTop: "1" })}>
					<MemberStateIcon state={state} />
				</div>
				<VStack gap="0.5" alignItems="stretch" flex="1" minWidth="0">
					<span
						className={cx(
							css({ fontSize: "sm", fontWeight: "semibold" }),
							call ? TONE_COLOR.default : TONE_COLOR.muted,
						)}
					>
						{gameSetRailLabel(question)}
					</span>
					<HStack
						justify="space-between"
						alignItems="baseline"
						gap="2"
						flexWrap="wrap"
					>
						<span className={monoSmall}>
							{call ? pickSummary({ ...call, question }) : uncalledText(state)}
						</span>
						{call && (
							<RowStanding question={question} call={call} state={state} />
						)}
					</HStack>
				</VStack>
			</HStack>
		</Link>
	)
}

function uncalledText(state: BallotMemberState): string {
	return state === "uncalled" ? "Not called yet" : "Not called"
}

function RowStanding({
	question,
	call,
	state,
}: {
	question: RailQuestion
	call: NonNullable<RailQuestion["viewerCall"]>
	state: BallotMemberState
}) {
	if (state === "won" || state === "lost") {
		const points = call.totalPoints ?? 0
		return (
			<StandingCell
				value={formatSignedPoints(points)}
				tone={points >= 0 ? "success" : "danger"}
			/>
		)
	}
	if (state === "voided") {
		return <StandingCell value="Void" tone="muted" />
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
				tone="default"
			/>
		)
	}
	return null
}

// One line under the pick: the number, then what it means when the number
// alone doesn't say.
function StandingCell({
	value,
	detail,
	tone,
}: {
	value: ReactNode
	detail?: string
	tone: RailTone
}) {
	return (
		<span
			className={css({
				fontFamily: "mono",
				fontSize: "xs",
				whiteSpace: "nowrap",
				marginInlineStart: "auto",
			})}
		>
			<span className={cx(css({ fontWeight: "bold" }), TONE_COLOR[tone])}>
				{value}
			</span>
			{detail && <span className={TONE_COLOR.muted}> · {detail}</span>}
		</span>
	)
}

// Above the list, since it's what there is still to do: before the game, how
// much is still open and when it locks. During it, how fresh the live
// numbers are, since they trail the game by a few minutes.
function RailStatusLine({
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

	if (gameStatus === "SCHEDULED" && firstLock) {
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
					: "Sign in to see your calls and how they did."}
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
