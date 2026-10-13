import { Link } from "@tanstack/react-router"
import { css, cx } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { CastCallFormFragment } from "#/components/questions/cast-call-form"
import { LockLine } from "#/components/questions/lock-line"
import { PlayerOrTeamImage } from "#/components/ui/player-or-team-image"
import { useFragment as unmask } from "#/graphql/generated"
import type {
	ChallengeEntry_EntryFragment,
	ChallengeMatchupRows_MatchupFragment,
} from "#/graphql/generated/graphql"
import { convictionSummary, pickSummary } from "#/lib/call-summary"
import {
	type ChallengePointsRange,
	challengePointsRange,
	signedPoints,
	sumPointsRanges,
	toPicks,
} from "#/lib/challenge"

type Entry = ChallengeEntry_EntryFragment
type Row = ChallengeMatchupRows_MatchupFragment["rows"][number]
type Call = NonNullable<Entry["creatorCall"]>

const mono = css({ fontFamily: "mono", fontSize: "xs", color: "fg.muted" })
const ellipsis = css({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
})

// What a call still stands to win or lose, while its question hasn't
// settled.
function openCallRange(
	entry: Entry,
	call: Call | null,
): ChallengePointsRange | null {
	const status = entry.question.status
	if (
		!call ||
		status === "VOIDED" ||
		status === "RESOLVED" ||
		status === "DISPUTED"
	) {
		return null
	}
	return challengePointsRange(
		unmask(CastCallFormFragment, entry.question),
		toPicks(call),
		false,
	)
}

// Each side's total still riding on the questions that haven't settled. A
// question with no 1v1 row yet counts the creator's call on its own.
export function openPointsBySide(
	entries: Entry[],
	rows: Row[],
): {
	creator: ChallengePointsRange | null
	acceptor: ChallengePointsRange | null
} {
	const rowFor = (entry: Entry) =>
		rows.find((r) => r.question.id === entry.question.id) ?? null
	return {
		creator: sumPointsRanges(
			entries.map((e) =>
				openCallRange(e, rowFor(e)?.creatorCall ?? e.creatorCall),
			),
		),
		acceptor: sumPointsRanges(
			entries.map((e) => openCallRange(e, rowFor(e)?.acceptorCall ?? null)),
		),
	}
}

// What a call counts for in the 1v1, as far as it can be said yet: what it
// stands to win or lose while the question is open, what it scored once it
// settles.
function PointsCell({
	entry,
	call,
	scored,
}: {
	entry: Entry
	call: Call | null
	scored: number | null | undefined
}) {
	const status = entry.question.status
	if (status === "VOIDED") return <span className={mono}>void</span>
	if (status === "RESOLVED" || status === "DISPUTED") {
		const points = scored ?? 0
		return (
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "sm",
					fontWeight: "bold",
					color:
						points > 0
							? "success.default"
							: points < 0
								? "danger.default"
								: "fg.default",
				})}
			>
				{signedPoints(points)}
			</span>
		)
	}
	const range = openCallRange(entry, call)
	if (!range) return null
	return (
		<span
			className={css({
				fontFamily: "mono",
				fontSize: "xs",
				whiteSpace: "nowrap",
			})}
		>
			<span className={css({ color: "success.default", fontWeight: "bold" })}>
				{range.winLow === range.winHigh
					? `+${range.winLow}`
					: `+${range.winLow}-${range.winHigh}`}
			</span>
			<span className={css({ color: "fg.subtle" })}> / </span>
			<span className={css({ color: "danger.default", fontWeight: "bold" })}>
				−{range.lose}
			</span>
		</span>
	)
}

// One side's call on one line: whose, the pick with its logo or headshot,
// how sure, and what it counts for.
function CallLine({
	who,
	entry,
	call,
	scored,
	empty,
	isViewer,
}: {
	who: string
	entry: Entry
	call: Call | null
	scored: number | null | undefined
	empty: string
	// The viewer's own line, picked out the way "this is you" is everywhere
	// else: blue, never the orange that means something can be tapped.
	isViewer: boolean
}) {
	const first = call?.selections[0]?.option
	return (
		<Grid
			gridTemplateColumns="5.5rem minmax(0, 1fr) auto"
			gap="3"
			alignItems="center"
			className={
				isViewer
					? css({
							marginInline: "-2",
							paddingInline: "2",
							paddingBlock: "1.5",
							borderRadius: "md",
							backgroundColor: "secondary.subtle",
						})
					: css({ paddingBlock: "1.5" })
			}
		>
			<span
				className={cx(
					mono,
					ellipsis,
					isViewer && css({ color: "secondary.default", fontWeight: "bold" }),
				)}
			>
				{who}
			</span>
			{call ? (
				<HStack gap="2" minWidth="0">
					{first && (
						<PlayerOrTeamImage player={first.player} team={first.team} />
					)}
					<span className={cx(css({ fontWeight: "semibold" }), ellipsis)}>
						{pickSummary(call)}
					</span>
					<span className={mono}>{convictionSummary(call)}</span>
				</HStack>
			) : (
				<span className={mono}>{empty}</span>
			)}
			<PointsCell entry={entry} call={call} scored={scored} />
		</Grid>
	)
}

// A question in a challenge as one compact row: the question, linking to its
// page, and each side's call on it stacked underneath. Everything needed to
// make a call lives in the step-through; this is the scoreboard.
export function ChallengeQuestionRow({
	entry,
	row,
	creatorLabel,
	opponent,
	viewerSide,
}: {
	entry: Entry
	// This question in a 1v1, when there is one to show.
	row: Row | null
	// The creator's line: "You" on their own challenge, "@them" elsewhere.
	creatorLabel: string
	// The second line: the viewer on their own 1v1, the acceptor on someone
	// else's. Null shows the creator's line alone.
	opponent: { label: string; call?: Call | null } | null
	// Which line is the viewer's, if either.
	viewerSide: "creator" | "opponent" | null
}) {
	const { question } = entry
	const creatorCall = row ? row.creatorCall : entry.creatorCall
	const opponentCall = row ? row.acceptorCall : (opponent?.call ?? null)

	return (
		<VStack
			gap="2"
			alignItems="stretch"
			className={css({
				paddingBlock: "3.5",
				borderBottom: "1px solid {colors.border.default}",
				_last: { borderBottom: "none" },
			})}
		>
			<HStack justify="space-between" gap="3" alignItems="baseline">
				<Link
					to="/questions/$questionId/{-$slug}"
					params={{ questionId: question.id }}
					className={css({
						fontWeight: "medium",
						fontSize: "sm",
						minWidth: "0",
						_hover: { textDecoration: "underline" },
					})}
				>
					{question.title}
				</Link>
				<span className={cx(mono, css({ flexShrink: 0 }))}>
					{match(question.status)
						.with("RESOLVED", "DISPUTED", () => "Final")
						.with("VOIDED", () => "Voided")
						.otherwise(() => (
							<LockLine status={question.status} locksAt={question.locksAt} />
						))}
				</span>
			</HStack>
			<CallLine
				who={creatorLabel}
				entry={entry}
				call={creatorCall}
				scored={row ? row.creatorPoints : entry.creatorPoints}
				empty="Not called yet"
				isViewer={viewerSide === "creator"}
			/>
			{opponent && (
				<CallLine
					who={opponent.label}
					entry={entry}
					call={opponentCall}
					scored={row?.acceptorPoints}
					empty="No call"
					isViewer={viewerSide === "opponent"}
				/>
			)}
		</VStack>
	)
}
