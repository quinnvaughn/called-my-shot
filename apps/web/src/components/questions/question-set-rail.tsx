import { Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { type ReactNode, useState } from "react"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { LockLine } from "#/components/questions/lock-line"
import { MemberStateIcon } from "#/components/questions/question-set-strip"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { Tabs } from "#/components/ui/tabs"
import type { QuestionStatus } from "#/graphql/generated/graphql"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import type { BallotMemberState } from "#/lib/ballot-member-state"
import { formatPayout } from "#/lib/call-summary"
import type { LiveStanding, RailTone } from "#/lib/game-set-rail"
import { questionSetNavigation } from "#/lib/question-set-navigation"
import { buildQuestionSlug } from "#/lib/slug"
import { openModal } from "#/stores/modal-store"

export type QuestionSetRailRow = {
	questionId: string
	questionTitle: string
	questionStatus: QuestionStatus
	locksAt: string
	// What the question is about, short enough for one line of the rail.
	label: string
	// The heading the row sits under. Null on a set with no sections.
	section: string | null
	state: BallotMemberState
	// The viewer's call: their pick as it reads in a sentence, and what it
	// scores. Null when they haven't called it.
	call: {
		pick: string
		totalPoints: number | null
		payout: { winLow: number; winHigh: number; lose: number } | null
	} | null
	// Where the pick stands mid-game, for a set that has one.
	live: LiveStanding | null
}

export type QuestionSetRailSummary = {
	calledCount: number
	questionCount: number
	wins: number
	losses: number
	points: number
}

// The viewer's tally over a set's rows, for the rail's summary and whatever
// share text the page builds from it. extraRows are calls made on top of the
// set (a game's community questions): they count toward the record and
// points but not toward how much of the set is called, since they aren't
// part of it.
export function questionSetRailSummary(
	rows: QuestionSetRailRow[],
	extraRows: QuestionSetRailRow[] = [],
): QuestionSetRailSummary {
	const all = [...rows, ...extraRows]
	return {
		calledCount: rows.filter((r) => r.call !== null).length,
		questionCount: rows.length,
		wins: all.filter((r) => r.state === "won").length,
		losses: all.filter((r) => r.state === "lost").length,
		points: all.reduce((sum, r) => sum + (r.call?.totalPoints ?? 0), 0),
	}
}

// A second list behind tabs beside the set's own: calls made on top of the
// set, like a game's community questions. The tab bar only shows once it has
// rows.
export type QuestionSetRailExtraTab = {
	setLabel: string
	extraLabel: string
	rows: QuestionSetRailRow[]
}

type Props = {
	// The left of the header line: what the set is, linked to its own page
	// when the rail sits beside one of its questions.
	heading: ReactNode
	isLive?: boolean
	rows: QuestionSetRailRow[]
	// Null when signed out.
	username: string | null
	// Shown in place of the summary when signed out.
	signedOutText: string
	// The question on screen, when the rail sits beside one: it's marked, and
	// the jump to the next uncalled question counts on from it.
	currentQuestionId?: string
	// Beside the summary once anything is called.
	share: ReactNode
	// A full-width action under the summary, for the signed-in viewer.
	action?: ReactNode
	// The viewer's picks on this set as a page of their own.
	picksPath: string | null
	// When the live numbers were last read, while there are any.
	statsAsOf?: string | null
	extraTab?: QuestionSetRailExtraTab | null
}

const labelBase = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
})

export const railHeadingClass = cx(labelBase, css({ color: "fg.muted" }))

export const railHeadingLinkClass = cx(
	labelBase,
	css({
		color: "fg.muted",
		textDecoration: "none",
		_hover: { color: "fg.default" },
	}),
)

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

// A set of questions (a game's official ones, a ballot's members) as one list
// beside the page, with the viewer's call on each. What's left to do sits on
// top, since the list can run past the bottom of the screen: the open count
// and the next uncalled question. QuestionSetStrip's job from xl up, with the
// room to say what each pick is.
export function QuestionSetRail({
	heading,
	isLive = false,
	rows,
	username,
	signedOutText,
	currentQuestionId,
	share,
	action,
	picksPath,
	statsAsOf = null,
	extraTab = null,
}: Props) {
	const extraRows = extraTab?.rows ?? []
	const currentIsExtra = extraRows.some(
		(r) => r.questionId === currentQuestionId,
	)
	// Opens on whichever list holds the question on screen. A tab picked by
	// hand holds only while that question is, so moving to another question
	// follows it to its list again.
	const [picked, setPicked] = useState<{
		tab: "set" | "extra"
		on: string | undefined
	} | null>(null)
	const activeTab =
		picked && picked.on === currentQuestionId
			? picked.tab
			: currentIsExtra
				? "extra"
				: "set"

	if (rows.length === 0 && extraRows.length === 0) return null

	const summary = questionSetRailSummary(rows, extraRows)
	const currentIndex = rows.findIndex((r) => r.questionId === currentQuestionId)
	const { nextUncalledIndex } = questionSetNavigation(
		rows.map((r) => r.state),
		currentIndex,
	)
	const nextUncalled =
		nextUncalledIndex !== null ? rows[nextUncalledIndex] : undefined
	const openUncalled = rows.filter((r) => r.state === "uncalled")
	const hasCalls = summary.calledCount > 0 || extraRows.length > 0

	return (
		<VStack gap="3" alignItems="stretch">
			<HStack justify="space-between" alignItems="baseline" gap="3">
				{heading}
				{isLive && <LiveTag />}
			</HStack>

			{username ? (
				<>
					<HStack justify="space-between" alignItems="center" gap="3">
						<Summary summary={summary} />
						{hasCalls && share}
					</HStack>
					{action}
				</>
			) : (
				<SignedOut text={signedOutText} />
			)}

			<RailStatusLine openUncalled={openUncalled} statsAsOf={statsAsOf} />

			{nextUncalled && (
				<Link
					to="/questions/$questionId/{-$slug}"
					params={{
						questionId: nextUncalled.questionId,
						slug: buildQuestionSlug(nextUncalled.questionTitle),
					}}
					className={actionLinkClass}
				>
					Next uncalled: {nextUncalled.label} →
				</Link>
			)}

			{extraTab && extraRows.length > 0 && (
				<Tabs
					value={activeTab}
					onValueChange={(tab) => setPicked({ tab, on: currentQuestionId })}
				>
					<Tabs.List stretch>
						<Tabs.Trigger value="set">
							{extraTab.setLabel} {summary.calledCount}/{summary.questionCount}
						</Tabs.Trigger>
						<Tabs.Trigger value="extra">
							{extraTab.extraLabel} {extraRows.length}
						</Tabs.Trigger>
					</Tabs.List>
				</Tabs>
			)}

			<RailList
				rows={activeTab === "extra" && extraRows.length > 0 ? extraRows : rows}
				currentQuestionId={currentQuestionId}
			/>

			{/* After the list rather than above it: it's the same picks as a
			    page of their own, which is where you'd go having read them. */}
			{username && picksPath && hasCalls && (
				<Link to={picksPath} className={actionLinkClass}>
					Your picks page →
				</Link>
			)}
		</VStack>
	)
}

function RailList({
	rows,
	currentQuestionId,
}: {
	rows: QuestionSetRailRow[]
	currentQuestionId?: string
}) {
	if (rows.length === 0) return null
	return (
		<Card variant="surface">
			<VStack gap="0" alignItems="stretch" paddingBlock="1">
				{sectionRuns(rows).map((run, i) => (
					<VStack
						// biome-ignore lint/suspicious/noArrayIndexKey: a section can repeat across runs, the position can't
						key={`${run.label}-${i}`}
						gap="0"
						alignItems="stretch"
					>
						{run.label && (
							<span
								className={cx(
									subtleLabelClass,
									css({
										paddingInline: "4",
										paddingTop: "3",
										paddingBottom: "1",
									}),
								)}
							>
								{run.label}
							</span>
						)}
						{run.rows.map((row) => (
							<RailRow
								key={row.questionId}
								row={row}
								isCurrent={row.questionId === currentQuestionId}
							/>
						))}
					</VStack>
				))}
			</VStack>
		</Card>
	)
}

// Consecutive rows under the same section. Runs rather than a group-by, so
// the set's own order holds even if a section were to come round twice.
function sectionRuns(
	rows: QuestionSetRailRow[],
): { label: string | null; rows: QuestionSetRailRow[] }[] {
	return rows.reduce<{ label: string | null; rows: QuestionSetRailRow[] }[]>(
		(runs, row) => {
			const last = runs.at(-1)
			if (last && last.label === row.section) last.rows.push(row)
			else runs.push({ label: row.section, rows: [row] })
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
function Summary({ summary }: { summary: QuestionSetRailSummary }) {
	const { calledCount, questionCount, wins, losses, points } = summary
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
	row,
	isCurrent,
}: {
	row: QuestionSetRailRow
	isCurrent: boolean
}) {
	return (
		<Link
			to="/questions/$questionId/{-$slug}"
			params={{
				questionId: row.questionId,
				slug: buildQuestionSlug(row.questionTitle),
			}}
			aria-current={isCurrent ? "page" : undefined}
			className={rowClass[isCurrent ? "current" : "default"]}
		>
			{/* Stacked rather than split into columns: at the rail's width a
			    column of numbers beside the label leaves the label half of it. */}
			<HStack gap="2.5" alignItems="flex-start">
				<div className={css({ paddingTop: "1" })}>
					<MemberStateIcon state={row.state} />
				</div>
				<VStack gap="0.5" alignItems="stretch" flex="1" minWidth="0">
					<span
						className={cx(
							css({ fontSize: "sm", fontWeight: "semibold" }),
							row.call ? TONE_COLOR.default : TONE_COLOR.muted,
						)}
					>
						{row.label}
					</span>
					<HStack
						justify="space-between"
						alignItems="baseline"
						gap="2"
						flexWrap="wrap"
					>
						<span className={monoSmall}>
							{row.call
								? row.call.pick
								: row.state === "uncalled"
									? "Not called yet"
									: "Not called"}
						</span>
						<RowStanding row={row} />
					</HStack>
				</VStack>
			</HStack>
		</Link>
	)
}

function RowStanding({ row }: { row: QuestionSetRailRow }) {
	const { call, state } = row
	if (!call) return null
	if (state === "won" || state === "lost") {
		const points = call.totalPoints ?? 0
		return (
			<StandingCell
				value={formatSignedPoints(points)}
				tone={points >= 0 ? "success" : "danger"}
			/>
		)
	}
	if (state === "voided") return <StandingCell value="Void" tone="muted" />
	if (row.live) return <StandingCell {...row.live} />
	if (row.questionStatus === "OPEN" && call.payout) {
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

// How fresh the live numbers are while there are any, since they trail the
// game by a few minutes. Otherwise how much is still open and when the first
// of it locks.
function RailStatusLine({
	openUncalled,
	statsAsOf,
}: {
	openUncalled: QuestionSetRailRow[]
	statsAsOf: string | null
}) {
	if (statsAsOf) {
		return (
			<span className={monoSmall}>
				Stats as of {DateTime.fromISO(statsAsOf).toFormat("h:mm a")}
			</span>
		)
	}
	const firstLock = openUncalled
		.map((r) => r.locksAt)
		.sort()
		.at(0)
	if (!firstLock) return null
	return (
		<span className={monoSmall}>
			{openUncalled.length} still open ·{" "}
			<LockLine status="OPEN" locksAt={firstLock} />
		</span>
	)
}

function SignedOut({ text }: { text: string }) {
	return (
		<VStack gap="3" alignItems="flex-start">
			<p className={css({ fontSize: "sm", color: "fg.muted" })}>{text}</p>
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
