import type { CallGifState } from "@called-my-shot/scoring"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
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
