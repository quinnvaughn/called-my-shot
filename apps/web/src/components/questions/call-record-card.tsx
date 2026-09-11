import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
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
	quip: string | null
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
	conviction: number
	caseText: string | null
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
							{resolved
								? nailed
									? "Nailed it"
									: win
										? "Called it"
										: "Missed"
								: "On the record"}
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
					</VStack>
					<HStack gap="2" alignItems="center">
						<Avatar size="xs" name={data.name} />
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
						{data.closeness?.kind === "exact" && (
							<StatRow label="Guess vs actual" value="Exact" />
						)}
						{data.closeness?.kind === "off" && (
							<StatRow label="Off by" value={data.closeness.by} />
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
					{data.quip && (
						<p
							className={css({
								fontSize: "xs",
								fontStyle: "italic",
								color: "fg.subtle",
								textAlign: "center",
							})}
						>
							{data.quip}
						</p>
					)}
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
