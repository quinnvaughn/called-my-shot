import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Avatar } from "#/components/ui/avatar"
import { Card } from "#/components/ui/card"
import type {
	ChallengeState,
	MatchupOutcome,
} from "#/graphql/generated/graphql"
import {
	type ChallengePointsRange,
	type ChallengeRecord,
	recordLine,
} from "#/lib/challenge"
import { pluralize } from "#/lib/pluralize"
import { ChallengeFact } from "./challenge-fact"
import { useStatusFact } from "./challenge-status"
import { MatchupScoreboard } from "./matchup-scoreboard"

// The top of a challenge: who made it, what it's over, where it stands, and
// the one thing to do about it.
export function ChallengeHero({
	creator,
	isCreator,
	state,
	closesAt,
	questionCount,
	acceptanceCount,
	tally,
	viewerHeadToHead,
	score,
	action,
	share,
}: {
	creator: { name: string; username: string; avatarUrl: string | null }
	isCreator: boolean
	state: ChallengeState
	closesAt: string | null
	questionCount: number
	acceptanceCount: number
	tally: ChallengeRecord
	viewerHeadToHead: ChallengeRecord | null
	// The viewer's own 1v1, once they've taken it on: both totals so far, and
	// who won once it's settled.
	// settled is how many of its questions have a result, which is all the
	// totals count so far.
	score: {
		you: number
		them: number
		settled: number
		outcome: MatchupOutcome | null
		// What each side still has riding on the questions that haven't
		// settled.
		open: {
			creator: ChallengePointsRange | null
			acceptor: ChallengePointsRange | null
		}
	} | null
	action: ReactNode
	share: ReactNode
}) {
	const them = `@${creator.username}`
	// Only the creator plays the whole field. Everyone else sees the page as
	// their own 1v1, or the one they'd be starting.
	const heading = match(state)
		.with("OPEN", () =>
			isCreator
				? "Your challenge"
				: score
					? `You took on ${them}`
					: `Can you beat ${them}?`,
		)
		.with("LIVE", () =>
			isCreator
				? "Your challenge is playing out"
				: score
					? `You vs ${them} is playing out`
					: `${them}'s challenge is playing out`,
		)
		.with("SETTLED", () => {
			if (isCreator) {
				return acceptanceCount > 0
					? `You went ${recordLine(tally)}`
					: "Your challenge is over"
			}
			if (!score?.outcome) return `${them}'s challenge is over`
			return match(score.outcome)
				.with("ACCEPTOR", () => `You beat ${them}`)
				.with("CREATOR", () => `${them} beat you`)
				.with("DRAW", () => `You and ${them} drew`)
				.exhaustive()
		})
		.with("VOIDED", () => "Every question in this challenge was voided")
		.exhaustive()

	const status = useStatusFact(state, closesAt)

	return (
		<Card variant="surface" size="lg">
			<Card.Body>
				<VStack gap="5" alignItems="stretch">
					<HStack justify="space-between" gap="4" alignItems="flex-start">
						<HStack gap="4" alignItems="center" minWidth="0">
							<Link
								to="/user/$username"
								params={{ username: creator.username }}
								aria-label={`@${creator.username}'s profile`}
							>
								<Avatar name={creator.name} src={creator.avatarUrl} size="lg" />
							</Link>
							<VStack gap="1" alignItems="flex-start" minWidth="0">
								<Link
									to="/user/$username"
									params={{ username: creator.username }}
									className={css({
										fontFamily: "mono",
										fontSize: "xs",
										fontWeight: "medium",
										letterSpacing: "wider",
										textTransform: "uppercase",
										color: "fg.muted",
										_hover: {
											color: "fg.default",
											textDecoration: "underline",
										},
									})}
								>
									{creator.name} · @{creator.username}
								</Link>
								<h1
									className={css({
										fontFamily: "heading",
										fontSize: { base: "2xl", md: "3xl" },
										lineHeight: "tight",
										overflowWrap: "anywhere",
									})}
								>
									{heading}
								</h1>
							</VStack>
						</HStack>
						<div className={css({ flexShrink: 0 })}>{share}</div>
					</HStack>

					<HStack gap={{ base: "6", md: "10" }} flexWrap="wrap">
						<ChallengeFact
							label={pluralize(questionCount, "Question")}
							value={String(questionCount)}
						/>
						{isCreator && (
							<ChallengeFact
								label="Took it on"
								value={String(acceptanceCount)}
							/>
						)}
						{/* Across every challenge between the two of them, either
						    one's. Shown before taking this one on too: it's part of
						    deciding whether to. */}
						{viewerHeadToHead && (
							<ChallengeFact
								label={`Your record vs @${creator.username}`}
								value={recordLine(viewerHeadToHead)}
							/>
						)}
						<ChallengeFact label={status.label} value={status.value} />
						{isCreator && state === "SETTLED" && acceptanceCount > 0 && (
							<ChallengeFact
								label="You vs the field"
								value={recordLine(tally)}
							/>
						)}
					</HStack>

					<p
						className={css({
							fontSize: "sm",
							color: "fg.muted",
							lineHeight: "relaxed",
						})}
					>
						{isCreator
							? "Everyone who takes it on is their own 1v1 against you"
							: score
								? `It's you against ${them}`
								: `Take it on and it's you against ${them}`}
						: whoever scores more points across these{" "}
						{pluralize(questionCount, "question")} wins. The early bonus and
						season pace don't count here, so it comes down to the calls. It
						closes when the first question locks.
					</p>

					{score && (
						<VStack gap="3" alignItems="stretch">
							<HStack justify="space-between" gap="3" flexWrap="wrap">
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "2xs",
										letterSpacing: "wide",
										textTransform: "uppercase",
										color: "fg.subtle",
									})}
								>
									Your 1v1 · points
								</span>
								{!score.outcome && (
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "sm",
											color: "fg.muted",
										})}
									>
										{score.settled === 0
											? "Nothing's settled yet"
											: score.you > score.them
												? `You're up ${score.you - score.them}`
												: score.them > score.you
													? `${them} is up ${score.them - score.you}`
													: "Even so far"}
									</span>
								)}
							</HStack>
							<MatchupScoreboard
								leading="acceptor"
								acceptor={{
									label: "You",
									points: score.you,
									open: score.open.acceptor,
								}}
								creator={{
									label: them,
									points: score.them,
									open: score.open.creator,
								}}
								outcome={score.outcome}
							/>
						</VStack>
					)}

					{action}
				</VStack>
			</Card.Body>
		</Card>
	)
}
