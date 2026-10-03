import { type CallGifState, GIF_POOLS } from "@called-my-shot/gifs"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Avatar } from "#/components/ui/avatar"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { InfoTip } from "#/components/ui/info-tip"
import {
	type ImagePlayer,
	type ImageTeam,
	PlayerOrTeamImage,
} from "#/components/ui/player-or-team-image"
import { ReactionGif } from "#/components/ui/reaction-gif"
import type { QuestionStatus } from "#/graphql/generated/graphql"

export type CallRecordCardData = {
	name: string
	username: string
	avatarUrl: string | null
	// Already formatted for display (e.g. "Minnesota Timberwolves", "Over
	// 47.5", "62") - see pickSummary in lib/call-summary.ts, which already
	// handles every question type's own formatting rules.
	pickLabel: string
	// The player or team a single pick is, shown beside pickLabel. Null for a
	// pick that is neither (Over, a numeric guess) and for a multi-pick call.
	pickSubject?: {
		player?: ImagePlayer | null
		team?: ImageTeam | null
	} | null
	// Award calls with more than one pick: each name, and once the question
	// resolves whether it hit. The card lists these in place of pickLabel so
	// every pick is marked on its own. Null on every other call.
	picks:
		| {
				label: string
				hit: boolean | null
				player?: ImagePlayer | null
				team?: ImageTeam | null
		  }[]
		| null
	// The date the call was made, already formatted (see formatCallDate). The
	// point of a record is when it was set, so this is never optional.
	calledAt: string
	// Null on all three until the question resolves - a call with no outcome
	// is still a record, it just doesn't have a result to state yet.
	isWin: boolean | null
	points: number | null
	// While unsettled, what the call pays if right and costs if wrong,
	// already formatted ("+107", "+80–120" for a numeric guess's range;
	// "−102"). Null once settled, and for a multi-pick award call.
	inTheAir: { win: string; lose: string } | null
	// Which reaction pool the card draws from. The state, not a chosen gif:
	// the pick happens on mount inside ReactionGif, so whoever renders the card
	// has nothing to decide - see callGifState in lib/call-gif.ts.
	gifState: CallGifState
	questionStatus: QuestionStatus
	// What to say in place of the result while it's pending: "Locks Jun 12,
	// 2027" or "Awaiting result".
	pendingLabel: string | null
	// % of the field that also picked this - null for numeric guesses (too
	// specific for anyone to share) and for
	// player_season_award/team_season_award (no single number describes
	// several independent picks at once).
	fieldPct: number | null
	// Numeric guesses only, once the actual value is in. An exact guess is its
	// own kind, since "Off by 0" reads as still being off, and gets its own
	// face. `by` is already formatted (see formatGuess).
	closeness: { kind: "exact" } | { kind: "off"; by: string } | null
	// Replaces the verdict word ("Called it" / "Missed") when this call's
	// margin was remarkable in either direction - see callMargin in
	// @called-my-shot/scoring. Null on the ordinary call, which is most of
	// them, and the eyebrow reads as it always has.
	marginLabel: string | null
	// How far the call landed from its line, already formatted. Set on every
	// shape with two numbers to subtract, not just the numeric guesses
	// `closeness` covers, and set whether or not the margin earned a label:
	// the distance is worth stating even when its size isn't remarkable.
	offBy: string | null
	// What actually happened, already formatted - "63", "Ja'Marr Chase: 118".
	// The pick and the points say whether the call landed; without this the
	// card never says what it landed against. Null on a question with no
	// number behind it (Yes/No, an award) and on one resolved by hand.
	actual: string | null
	conviction: number
	caseText: string | null
	// Set on a win at least STREAK_TAG_MIN into its league-and-family streak.
	streakLength: number | null
	// Set when this call is a fade: whose call it was aimed at, and once the
	// question has closed, how it went and the line the winner sent.
	fading: {
		username: string
		callId: string
		// Past tense once the question is resolved or voided.
		settled: boolean
		// won/lost from this call's side. flipped: the target switched onto
		// this side after being faded, so neither won. Null until there's a
		// result, and after a void.
		outcome: "won" | "lost" | "flipped" | null
		gloat: { username: string; text: string } | null
	} | null
}

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
						<HStack gap="2" alignItems="center" minWidth="0">
							<Link
								to="/user/$username"
								params={{ username: data.username }}
								className={css({
									display: "inline-flex",
									alignItems: "center",
									gap: "2",
									minWidth: "0",
									textDecoration: "none",
									color: "fg.default",
									_hover: { "& span": { textDecoration: "underline" } },
								})}
							>
								<Avatar size="xs" name={data.name} src={data.avatarUrl} />
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "xs",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									})}
								>
									@{data.username}
								</span>
							</Link>
							<span
								className={css({
									flexShrink: "0",
									fontFamily: "mono",
									fontSize: "xs",
									color: "fg.muted",
									whiteSpace: "nowrap",
								})}
							>
								· {data.calledAt}
							</span>
						</HStack>
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
									<PickLine key={pick.label} pick={pick} />
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
								value={`${win ? "+" : "−"}${Math.abs(data.points ?? 0)}`}
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
					{data.fading && <FadeLine fading={data.fading} />}
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
							<StatRow
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
							<StatRow label="Guess vs actual" value="Exact" />
						) : (
							data.offBy !== null && (
								<StatRow label="Off by" value={data.offBy} />
							)
						)}
						<StatRow
							label="Conviction"
							value={`${Math.round(data.conviction)}%`}
							hint={CONVICTION_HINT}
						/>
						{!resolved && (
							<StatRow
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

// One pick of a multi-pick award call. A miss is muted like a missed call's
// headline, and a pending pick carries no mark at all.
function PickLine({
	pick,
}: {
	pick: NonNullable<CallRecordCardData["picks"]>[number]
}) {
	return (
		<HStack gap="2.5" alignItems="center">
			<PlayerOrTeamImage player={pick.player} team={pick.team} />
			<span
				className={css({
					fontFamily: "heading",
					fontSize: "xl",
					lineHeight: "1.2",
					color: pick.hit === false ? "fg.muted" : "fg.default",
				})}
			>
				{pick.label}
			</span>
			{pick.hit !== null && (
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						fontWeight: "medium",
						textTransform: "uppercase",
						letterSpacing: "wider",
						color: pick.hit ? "success.default" : "danger.default",
					})}
				>
					{pick.hit ? "Hit" : "Miss"}
				</span>
			)}
		</HStack>
	)
}

// A stat's own vocabulary, for someone who landed here from a shared link
// with no idea what the app is: what the number does to the points.
const CONVICTION_HINT =
	"How much of this pick's points they put on the line. Higher conviction pays more if right and costs more if wrong."
const FIELD_AGREED_HINT =
	"The share of everyone who called this question that picked the same thing. The fewer who agree, the more a correct pick pays."

function StatRow({
	label,
	value,
	hint,
}: {
	label: string
	value: string
	hint?: string
}) {
	return (
		<HStack alignItems="center" justify="space-between" width="full">
			<HStack gap="1" alignItems="center">
				<Eyebrow size="sm" variant="neutral">
					{label}
				</Eyebrow>
				{hint && <InfoTip label={label.toLowerCase()} text={hint} />}
			</HStack>
			<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
				{value}
			</span>
		</HStack>
	)
}

// The fade this call is, under the question: whose call it was aimed at, then
// once it settles how it went and the winner's line, written on the card
// where the loser's own record shows it.
function FadeLine({
	fading,
}: {
	fading: NonNullable<CallRecordCardData["fading"]>
}) {
	const outcome = match(fading.outcome)
		.with("won", () => ({
			text: `Cashed against @${fading.username}`,
			tone: "success" as const,
		}))
		.with("lost", () => ({
			text: `Lost the fade to @${fading.username}`,
			tone: "danger" as const,
		}))
		.with("flipped", () => ({
			text: `@${fading.username} switched to this side after the fade`,
			tone: "neutral" as const,
		}))
		.with(null, () => null)
		.exhaustive()

	return (
		<VStack gap="2" alignItems="flex-start" paddingTop="1">
			<Link
				to="/calls/$callId"
				params={{ callId: fading.callId }}
				className={css({
					fontFamily: "mono",
					fontSize: "xs",
					fontWeight: "bold",
					letterSpacing: "wide",
					textTransform: "uppercase",
					textDecoration: "none",
					color: "primary.default",
					border: "1px solid {colors.primary.default}",
					borderRadius: "sm",
					paddingBlock: "1",
					paddingInline: "2.5",
					_hover: { opacity: 0.8 },
				})}
			>
				{fading.settled ? "Faded" : "Fading"} @{fading.username} →
			</Link>
			{outcome && (
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color:
							outcome.tone === "success"
								? "success.default"
								: outcome.tone === "danger"
									? "danger.default"
									: "fg.muted",
					})}
				>
					{outcome.text}
				</span>
			)}
			{fading.gloat && (
				<p
					className={css({
						fontSize: "md",
						color: "fg.default",
					})}
				>
					<Link
						to="/user/$username"
						params={{ username: fading.gloat.username }}
						className={css({
							fontWeight: "bold",
							color: "fg.default",
							textDecoration: "underline",
							textUnderlineOffset: "3px",
							_hover: { color: "fg.muted" },
						})}
					>
						@{fading.gloat.username}
					</Link>
					: "{fading.gloat.text}"
				</p>
			)}
		</VStack>
	)
}

export type RecordTone = "pending" | "success" | "danger"

// Panda reads token classes statically, so each tone is its own literal
// css() call rather than a lookup inside one.
const recordTagClassByTone: Record<RecordTone, string> = {
	pending: css({
		backgroundColor: "secondary.subtle",
		color: "secondary.default",
	}),
	success: css({
		backgroundColor: "success.subtle",
		color: "success.default",
	}),
	danger: css({
		backgroundColor: "danger.subtle",
		color: "danger.default",
	}),
}

const recordTagBaseClass = css({
	flexShrink: "0",
	fontFamily: "mono",
	fontSize: "2xs",
	fontWeight: "bold",
	letterSpacing: "wide",
	textTransform: "uppercase",
	borderRadius: "sm",
	paddingBlock: "1",
	paddingInline: "2",
	whiteSpace: "nowrap",
})

// What the corner tag says about a call, here and on CallCard in a feed, so
// the two never describe the same result in different words. isWin is null
// until the call settles; until then the tag names the question's state,
// since Open (the field, and so the payout, can still move) and Locked
// (every pick is frozen until the result) are different things to be waiting
// on. An exact guess keeps "Nailed it" over any margin label: it is the
// rarer claim, and a second superlative next to it reads as two prizes for
// one result.
export function recordTagFor({
	status,
	isWin,
	nailed,
	marginLabel,
	streakLength,
}: {
	status: QuestionStatus
	isWin: boolean | null
	nailed: boolean
	marginLabel: string | null
	streakLength: number | null
}): { tone: RecordTone; label: string } {
	if (isWin === null) {
		return {
			tone: "pending",
			// A settled question with no result for this call means
			// resolution left it out of scoring.
			label: match(status)
				.with("OPEN", () => "Open")
				.with("LOCKED", () => "Locked")
				.with("VOIDED", () => "Voided")
				.with("RESOLVED", "DISPUTED", () => "Not scored")
				.exhaustive(),
		}
	}
	const verdict = nailed
		? "Nailed it"
		: (marginLabel ?? (isWin ? "Called it" : "Missed"))
	return {
		tone: isWin ? "success" : "danger",
		label:
			isWin && streakLength !== null
				? `${verdict} · ${streakLength} in a row`
				: verdict,
	}
}

// Where the call stands, small in the corner: blue while it's still out
// there, green or red once it settles.
export function RecordTag({
	tone,
	children,
}: {
	tone: RecordTone
	children: ReactNode
}) {
	return (
		<span className={cx(recordTagBaseClass, recordTagClassByTone[tone])}>
			{children}
		</span>
	)
}

const recordStatValueClassByTone: Record<
	Exclude<RecordTone, "pending">,
	string
> = {
	success: css({
		fontFamily: "mono",
		fontSize: "2xl",
		fontWeight: "bold",
		lineHeight: "1",
		color: "success.default",
	}),
	danger: css({
		fontFamily: "mono",
		fontSize: "2xl",
		fontWeight: "bold",
		lineHeight: "1",
		color: "danger.default",
	}),
}

export function RecordStat({
	value,
	label,
	tone,
}: {
	value: string
	label: string
	tone: Exclude<RecordTone, "pending">
}) {
	return (
		<VStack gap="1.5" alignItems="flex-start">
			<span className={recordStatValueClassByTone[tone]}>{value}</span>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "fg.muted",
				})}
			>
				{label}
			</span>
		</VStack>
	)
}
