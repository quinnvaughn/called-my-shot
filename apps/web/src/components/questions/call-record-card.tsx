import type { CallGifState } from "@called-my-shot/scoring"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { CallGif } from "#/components/questions/call-gif"
import { Avatar } from "#/components/ui/avatar"
import { Brand } from "#/components/ui/brand"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"

export type CallRecordCardData = {
	questionTitle: string
	leagueAbbr: string
	categoryLabel: string
	name: string
	username: string
	avatarUrl: string | null
	// Already formatted for display (e.g. "Minnesota Timberwolves", "Over
	// 47.5", "62") - see pickSummary in lib/call-summary.ts, which already
	// handles every question type's own formatting rules.
	pickLabel: string
	// The date the call was made, already formatted (see formatCallDate). The
	// point of a record is when it was set, so this is never optional.
	calledAt: string
	// Null on all three until the question resolves - a call with no outcome
	// is still a record, it just doesn't have a result to state yet.
	isWin: boolean | null
	points: number | null
	// Which reaction pool the card draws from. The state, not a chosen gif:
	// the pick happens on mount inside CallGif, so whoever renders the card
	// has nothing to decide - see callGifState in lib/call-gif.ts.
	gifState: CallGifState
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

type Props = { data: CallRecordCardData }

// The centrepiece of /calls/:id: one call, stated as a record. Deliberately
// takes a flat data object rather than a GraphQL fragment - it renders the
// same thing whatever the call arrives as, and the og:image (apps/api's
// share-cards/call-card.ts) is built from the same set of facts, so the page
// and the unfurl of it can't drift apart.
//
// Kept separate from ShareCardPreview (the profile's track-record card) even
// though both are a Card with the wordmark on top: a career stat line and a
// single call are different claims, and merging them would mean one data
// shape serving neither.
export function CallRecordCard({ data }: Props) {
	const resolved = data.points !== null && data.isWin !== null
	const win = data.isWin === true
	const nailed = data.closeness?.kind === "exact"
	return (
		<Card size="md" accent={nailed}>
			<Card.Header>
				<VStack gap="4" alignItems="center" width="full">
					<Brand size="sm" />
					<VStack gap="1.5" alignItems="center">
						<Eyebrow
							size="sm"
							variant={!resolved || win ? "primary" : "neutral"}
						>
							{/* An exact guess keeps "Nailed it" over any margin label:
							it is the rarer claim, and a second superlative next to
							it reads as two prizes for one result. */}
							{resolved
								? nailed
									? "Nailed it"
									: (data.marginLabel ?? (win ? "Called it" : "Missed"))
								: "On the record"}
							{resolved && win && data.streakLength !== null
								? ` · ${data.streakLength} in a row`
								: ""}
						</Eyebrow>
						<span
							className={css({
								fontFamily: "heading",
								fontSize: "2xl",
								textAlign: "center",
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
						<span
							className={css({
								fontSize: "xs",
								color: "fg.subtle",
								textAlign: "center",
							})}
						>
							{data.questionTitle}
						</span>
						{/* Directly under the question it answers, at headline weight.
						As one more StatRow down in the body it sat between "Field
						agreed" and "Conviction" and read as the same order of
						trivia - the pick and the points say whether the call
						landed, and this is the only thing on the card that says
						what it landed against. */}
						{data.actual !== null && (
							<HStack gap="2" alignItems="baseline" paddingTop="1">
								<Eyebrow size="sm" variant="neutral">
									Actual
								</Eyebrow>
								<span
									className={css({
										fontFamily: "heading",
										fontSize: "xl",
										lineHeight: "1.2",
										textAlign: "center",
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
					<HStack gap="2" alignItems="center">
						<Avatar size="xs" name={data.name} src={data.avatarUrl} />
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "xs",
								color: "fg.muted",
							})}
						>
							@{data.username} · called {data.calledAt}
						</span>
					</HStack>
				</VStack>
			</Card.Header>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					{data.caseText && (
						<VStack gap="1.5" alignItems="stretch">
							{/* Same words CaseBlock labels this with everywhere else -
							a bare quote leaves the reader to work out whose words
							they are and why they're there. */}
							<Eyebrow size="sm" variant="neutral">
								The case
							</Eyebrow>
							<p
								className={css({
									fontSize: "xs",
									fontStyle: "italic",
									color: "fg.body",
									lineHeight: "relaxed",
									borderLeft: "2px solid {colors.border.emphasized}",
									paddingLeft: "3",
								})}
							>
								"{data.caseText}"
							</p>
						</VStack>
					)}
					<VStack gap="2.5" alignItems="stretch">
						{data.fieldPct !== null && (
							<StatRow
								label="Field agreed"
								value={`${Math.round(data.fieldPct)}%`}
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
						/>
					</VStack>
					<HStack
						justify="space-between"
						alignItems="baseline"
						className={css({
							borderTop: "1px solid {colors.border.default}",
							paddingTop: "3",
						})}
					>
						<Eyebrow size="sm" variant="neutral">
							{resolved ? "Result" : "Status"}
						</Eyebrow>
						{resolved ? (
							<span
								className={css({
									fontFamily: "heading",
									fontSize: "2xl",
									color: win ? "success.default" : "danger.default",
								})}
							>
								{win ? "+" : "−"}
								{Math.abs(data.points ?? 0)} pts
							</span>
						) : (
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "sm",
									color: "fg.muted",
								})}
							>
								{data.pendingLabel ?? "Awaiting result"}
							</span>
						)}
					</HStack>
					<CallGif state={data.gifState} />
				</VStack>
			</Card.Body>
			<Card.Footer>
				<HStack
					justify="space-between"
					alignItems="center"
					className={css({ color: "fg.muted", fontSize: "2xs" })}
				>
					<span>calledmyshot.com/{data.username}</span>
					<span>
						{data.leagueAbbr} · {data.categoryLabel}
					</span>
				</HStack>
			</Card.Footer>
		</Card>
	)
}

function StatRow({ label, value }: { label: string; value: string }) {
	return (
		<HStack alignItems="center" justify="space-between" width="full">
			<Eyebrow size="sm" variant="neutral">
				{label}
			</Eyebrow>
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
		<VStack gap="2" alignItems="center" paddingTop="1">
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
						textAlign: "center",
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
						textAlign: "center",
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
