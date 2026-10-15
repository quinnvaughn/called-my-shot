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
import type { ChallengePointsRange, ChallengeRecord } from "#/lib/challenge"
import { formatSigned } from "#/lib/format-number"
import { formatRecord } from "#/lib/game-status"
import { pluralize } from "#/lib/pluralize"
import { ChallengeFact } from "./challenge-fact"
import { useStatusFact } from "./challenge-status"
import { MatchupScoreboard } from "./matchup-scoreboard"

// The top of a challenge: who made it, what it's over, where it stands, and
// the one thing to do about it.
export function ChallengeHero({
	creator,
	isCreator,
	matchup,
	state,
	closesAt,
	questionCount,
	acceptanceCount,
	tally,
	viewerHeadToHead,
	creatorPoints,
	score,
	action,
	share,
}: {
	creator: { name: string; username: string; avatarUrl: string | null }
	isCreator: boolean
	// "CLE @ TB" when every question is on one game, which names the
	// challenge in the creator's heading.
	matchup: string | null
	state: ChallengeState
	closesAt: string | null
	questionCount: number
	acceptanceCount: number
	tally: ChallengeRecord
	viewerHeadToHead: ChallengeRecord | null
	// The creator's own total across the questions, shown on their view once
	// a question has a result. The same in every 1v1, so it lives here
	// rather than on each row of the list.
	creatorPoints: number | null
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
	// Only the creator plays the whole field, and their heading just names
	// the challenge: the facts under it carry how it went, and the status line
	// where it stands. Everyone else sees the page as their own 1v1, or the
	// one they'd be starting.
	const creatorHeading = matchup ? `Your ${matchup} challenge` : "Your challenge"
	const heading = match(state)
		.with("OPEN", () =>
			isCreator
				? creatorHeading
				: score
					? `You took on ${them}`
					: `Can you beat ${them}?`,
		)
		.with("LIVE", () =>
			isCreator
				? creatorHeading
				: score
					? `You vs ${them} is playing out`
					: `${them}'s challenge is playing out`,
		)
		.with("SETTLED", () => {
			if (isCreator) return creatorHeading
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
	const showFieldRecord =
		isCreator && state === "SETTLED" && acceptanceCount > 0
	const hasHeadline = isCreator || viewerHeadToHead !== null

	return (
		<Card variant="surface" size="lg">
			<Card.Body>
				<VStack gap="5" alignItems="stretch">
					{/* The share buttons drop to their own row on a phone, where
					    beside the avatar they'd leave the heading a letter wide. */}
					<div
						className={css({
							display: "flex",
							flexDirection: { base: "column", sm: "row" },
							justifyContent: "space-between",
							alignItems: { base: "stretch", sm: "flex-start" },
							gap: "4",
						})}
					>
						<HStack gap="4" alignItems="flex-start" minWidth="0">
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
					</div>

					{/* The numbers that say how it went, big and colored by which
					    way they went. The question count and status are context,
					    so they share one quiet line under them. */}
					<VStack gap="3" alignItems="stretch">
						{hasHeadline && (
							<HStack gap={{ base: "6", md: "10" }} flexWrap="wrap">
								{isCreator && creatorPoints !== null && (
									<ChallengeFact
										size="xl"
										label="Your points"
										value={formatSigned(creatorPoints)}
										tone={pointsTone(creatorPoints)}
									/>
								)}
								{showFieldRecord && (
									<ChallengeFact
										size="xl"
										label="You vs the field"
										value={formatRecord(
											tally.wins,
											tally.losses,
											tally.draws || null,
										)}
										tone={recordTone(tally)}
									/>
								)}
								{/* Until it settles, how many took it on is the
								    creator's number. After, the record above counts
								    them. */}
								{isCreator && !showFieldRecord && (
									<ChallengeFact
										size="xl"
										label="Took it on"
										value={String(acceptanceCount)}
									/>
								)}
								{/* Across every challenge between the two of them,
								    either one's. Shown before taking this one on too:
								    it's part of deciding whether to. */}
								{viewerHeadToHead && (
									<ChallengeFact
										size="xl"
										label={`Your record vs @${creator.username}`}
										value={formatRecord(
											viewerHeadToHead.wins,
											viewerHeadToHead.losses,
											viewerHeadToHead.draws || null,
										)}
										tone={recordTone(viewerHeadToHead)}
									/>
								)}
							</HStack>
						)}
						<span
							className={css({
								textStyle: "label",
								color: "fg.subtle",
							})}
						>
							{questionCount} {pluralize(questionCount, "question")} ·{" "}
							{state === "OPEN" && closesAt
								? `Closes ${status.value}`
								: status.value}
						</span>
					</VStack>

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
										textStyle: "label",
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

function pointsTone(points: number): "default" | "success" | "danger" {
	return points > 0 ? "success" : points < 0 ? "danger" : "default"
}

function recordTone({
	wins,
	losses,
}: ChallengeRecord): "default" | "success" | "danger" {
	return wins > losses ? "success" : losses > wins ? "danger" : "default"
}
