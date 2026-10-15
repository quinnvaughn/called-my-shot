import { Link } from "@tanstack/react-router"
import { css, cx } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { LockLine } from "#/components/questions/lock-line"
import { CallLine } from "./call-line"
import { mono } from "./styles"
import type { Call, Entry, Row } from "./types"

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
			{/* Both sides' lines share one set of columns, so the picks line
			    up while the name column is only as wide as the longest name
			    shown, capped so a long handle truncates instead. */}
			<Grid
				gridTemplateColumns="fit-content(8rem) minmax(0, 1fr) auto"
				columnGap="3"
				rowGap="2"
			>
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
			</Grid>
		</VStack>
	)
}
