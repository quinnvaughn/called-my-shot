import { GIF_POOLS } from "@called-my-shot/gifs"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { CallTimestamp } from "#/components/questions/call-timestamp"
import { RecordByline } from "#/components/records/record-byline"
import { RecordStat } from "#/components/records/record-stat"
import { RecordTag } from "#/components/records/record-tag"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { PlayerOrTeamImage } from "#/components/ui/player-or-team-image"
import { ReactionGif } from "#/components/ui/reaction-gif"
import { formatSigned } from "#/lib/format-number"
import { recordTagFor } from "#/lib/record-tag"
import { CallRecordFadeLine } from "./call-record-fade-line"
import { CallRecordPickLine } from "./call-record-pick-line"
import { CallRecordStatRow } from "./call-record-stat-row"
import type { CallRecordCardData } from "./types"

// A stat's own vocabulary, for someone who landed here from a shared link
// with no idea what the app is: what the number does to the points.
const CONVICTION_HINT =
	"How much of this pick's points they put on the line. Higher conviction pays more if right and costs more if wrong."
const FIELD_AGREED_HINT =
	"The share of everyone who called this question that picked the same thing. The fewer who agree, the more a correct pick pays."

type Props = {
	data: CallRecordCardData
	// The owner's offer to take the pick back (RedoCta), rendered under the
	// points it would change. Null for anyone else and once it's off the table.
	redo?: ReactNode
	// What to do with the call from here - where to see the rest of the
	// question, and the ways of sending this one on. Owned by the page, which
	// knows the viewer and the surface to track the share against.
	footer: ReactNode
}

// The centrepiece of /calls/:id: one call, stated as a record. Deliberately
// takes a flat data object rather than a GraphQL fragment - it renders the
// same thing whatever the call arrives as, and the og:image (apps/api's
// share-cards/call-card.ts) is built from the same set of facts, so the page
// and the unfurl of it can't drift apart.
export function CallRecordCard({ data, redo = null, footer }: Props) {
	const resolved = data.points !== null && data.isWin !== null
	const win = data.isWin === true
	const nailed = data.closeness?.kind === "exact"
	const tag = recordTagFor({
		status: data.questionStatus,
		isWin: resolved ? data.isWin : null,
		nailed,
		marginLabel: data.marginLabel,
		streakLength: data.streakLength,
	})
	return (
		<Card size="md" accent={nailed}>
			<Card.Header>
				<VStack gap="4" alignItems="stretch" width="full">
					{/* Who and when on the left, how it stands on the right - the
					same header row the question page's status card opens with. */}
					<HStack justify="space-between" gap="3" alignItems="center">
						<RecordByline
							name={data.name}
							username={data.username}
							avatarUrl={data.avatarUrl}
							date={<CallTimestamp iso={data.calledAt} />}
						/>
						<RecordTag tone={tag.tone}>{tag.label}</RecordTag>
					</HStack>
					{/* The question is the page's title above this card, so the
					card leads with the answer to it, labelled as such. */}
					<VStack gap="3" alignItems="flex-start">
						<Eyebrow size="sm" variant="neutral">
							The call
						</Eyebrow>
						{data.picks ? (
							<VStack gap="1" alignItems="flex-start">
								{data.picks.map((pick) => (
									<CallRecordPickLine key={pick.label} pick={pick} />
								))}
							</VStack>
						) : (
							<HStack gap="3" alignItems="center" minWidth="0">
								{data.pickSubject && (
									<PlayerOrTeamImage
										player={data.pickSubject.player}
										team={data.pickSubject.team}
										size="lg"
									/>
								)}
								<span
									className={css({
										fontFamily: "heading",
										fontSize: { base: "2xl", sm: "3xl" },
										lineHeight: "1.15",
										// A pending call is not a loss, so it never gets the muted
										// treatment a miss does.
										color: nailed
											? "primary.default"
											: resolved && !win
												? "fg.muted"
												: "fg.default",
									})}
								>
									{data.pickLabel}
								</span>
							</HStack>
						)}
						{/* The numbers at the pick's own scale: the final points once
						settled, what's in the air before that. */}
						{resolved ? (
							<RecordStat
								value={formatSigned(data.points ?? 0, { zeroSign: true })}
								label="Final"
								tone={win ? "success" : "danger"}
							/>
						) : (
							data.inTheAir && (
								<HStack gap="8" alignItems="flex-start">
									<RecordStat
										value={data.inTheAir.win}
										label="If right"
										tone="success"
									/>
									<RecordStat
										value={data.inTheAir.lose}
										label="If wrong"
										tone="danger"
									/>
								</HStack>
							)
						)}
					</VStack>
					{redo}
					{/* What it landed against, once there's an answer. */}
					{data.actual !== null && (
						<HStack
							gap="2"
							alignItems="baseline"
							className={css({
								paddingTop: "3",
								borderTop: "1px solid {colors.border.default}",
							})}
						>
							<Eyebrow size="sm" variant="neutral">
								Actual
							</Eyebrow>
							<span
								className={css({
									fontFamily: "heading",
									fontSize: "lg",
									lineHeight: "1.2",
									color: "fg.default",
								})}
							>
								{data.actual}
							</span>
						</HStack>
					)}
					{/* After the question and what actually happened, so the pick
					reads as an answer to the question first and the fade reads
					as a second claim about it, not as the thing being asked. */}
					{data.fading && <CallRecordFadeLine fading={data.fading} />}
				</VStack>
			</Card.Header>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					{data.caseText && (
						<VStack
							gap="1.5"
							alignItems="stretch"
							className={css({
								bg: "bg.subtle",
								borderRadius: "lg",
								paddingX: "4",
								paddingY: "3",
							})}
						>
							{/* Same words CaseBlock labels this with everywhere else -
							a bare quote leaves the reader to work out whose words
							they are and why they're there. */}
							<Eyebrow size="sm" variant="neutral">
								The case
							</Eyebrow>
							<p
								className={css({
									fontSize: "sm",
									color: "fg.default",
									lineHeight: "relaxed",
									whiteSpace: "pre-wrap",
									overflowWrap: "anywhere",
								})}
							>
								{data.caseText}
							</p>
						</VStack>
					)}
					<VStack gap="2.5" alignItems="stretch">
						{data.fieldPct !== null && (
							<CallRecordStatRow
								label="Field agreed"
								value={`${Math.round(data.fieldPct)}%`}
								hint={FIELD_AGREED_HINT}
							/>
						)}
						{/* "Off by 0" reads as still being off, so an exact guess keeps
						its own row. Every other resolved call with two numbers to
						subtract gets the distance, which used to be numeric guesses
						only - an over/under stated its line and its actual and left
						the reader to work out that a yard was all that separated
						them. */}
						{data.closeness?.kind === "exact" ? (
							<CallRecordStatRow label="Guess vs actual" value="Exact" />
						) : (
							data.offBy !== null && (
								<CallRecordStatRow label="Off by" value={data.offBy} />
							)
						)}
						<CallRecordStatRow
							label="Conviction"
							value={`${Math.round(data.conviction)}%`}
							hint={CONVICTION_HINT}
						/>
						{!resolved && (
							<CallRecordStatRow
								label="Status"
								value={data.pendingLabel ?? "Awaiting result"}
							/>
						)}
					</VStack>
					<ReactionGif pool={GIF_POOLS[data.gifState]} />
				</VStack>
			</Card.Body>
			<Card.Footer>{footer}</Card.Footer>
		</Card>
	)
}
