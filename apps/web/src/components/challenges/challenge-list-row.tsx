import { Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { Identity } from "#/components/ui/identity"
import type { MyChallengesQuery } from "#/graphql/generated/graphql"
import { useMe } from "#/hooks/use-me"
import { singleGameOf } from "#/lib/challenge"
import { formatSigned } from "#/lib/format-number"
import { formatRecord, matchupLabel } from "#/lib/game-status"
import { pluralize } from "#/lib/pluralize"
import { ChallengeFact } from "./challenge-fact"
import { useStatusFact } from "./challenge-status"
import { outcomeForSide } from "./matchup-list"

type Item = MyChallengesQuery["myChallenges"][number]

// What a challenge is over: its one game, or how many games it spans.
function gameLine(questions: Item["entries"][number]["question"][]): string {
	const game = singleGameOf(questions)
	if (game) {
		return `${matchupLabel(game)} · ${DateTime.fromISO(game.startsAt).toFormat("EEE, MMM d")}`
	}
	const games = new Set(questions.flatMap((q) => (q.game ? [q.game.id] : [])))
	return games.size > 0
		? `${games.size} ${pluralize(games.size, "game")}`
		: "Season-long"
}

// A challenge in a list: what it's over and where it stands, in numbers.
// The viewer's own is told from the creator's side (who took it on, the
// record against them); one they took on, from their 1v1, with whose it is.
export function ChallengeListRow({ challenge }: { challenge: Item }) {
	const me = useMe()
	const isCreator = challenge.creator.id === me?.id
	const mine = challenge.viewerMatchup
	const questions = challenge.entries.map((e) => e.question)
	const status = useStatusFact(challenge.state, challenge.closesAt)
	// Points only mean something once a question has a result.
	const anySettled = questions.some(
		(q) => q.status === "RESOLVED" || q.status === "DISPUTED",
	)
	const creatorTotal = challenge.entries.reduce(
		(sum, e) => sum + (e.creatorPoints ?? 0),
		0,
	)

	return (
		<Link to="/challenges/$code" params={{ code: challenge.code }}>
			<Card size="sm" interactive>
				<Card.Body>
					<VStack gap="3" alignItems="stretch">
						<HStack justify="space-between" gap="3">
							{isCreator ? (
								<span
									className={css({
										textStyle: "sectionHeading",
										color: "fg.muted",
									})}
								>
									{gameLine(questions)}
								</span>
							) : (
								<Identity
									name={challenge.creator.name}
									username={challenge.creator.username}
									avatarUrl={challenge.creator.avatarUrl}
								/>
							)}
							{!isCreator && (
								<span
									className={css({
										textStyle: "metaLg",
										color: "fg.muted",
										flexShrink: 0,
									})}
								>
									{gameLine(questions)}
								</span>
							)}
						</HStack>
						<HStack gap={{ base: "5", md: "8" }} flexWrap="wrap">
							<ChallengeFact
								size="md"
								label={pluralize(questions.length, "Question")}
								value={String(questions.length)}
							/>
							{isCreator && (
								<ChallengeFact
									size="md"
									label="Took it on"
									value={String(challenge.acceptanceCount)}
								/>
							)}
							<ChallengeFact
								size="md"
								label={status.label}
								value={status.value}
							/>
							{isCreator && anySettled && (
								<ChallengeFact
									size="md"
									label="Your points"
									value={formatSigned(creatorTotal)}
								/>
							)}
							{isCreator &&
								challenge.state === "SETTLED" &&
								challenge.acceptanceCount > 0 && (
									<ChallengeFact
										size="md"
										label="You vs the field"
										value={formatRecord(
											challenge.creatorTally.wins,
											challenge.creatorTally.losses,
											challenge.creatorTally.draws || null,
										)}
									/>
								)}
							{mine && anySettled && (
								<>
									<ChallengeFact
										size="md"
										label="You"
										value={formatSigned(mine.acceptorPoints)}
									/>
									<ChallengeFact
										size="md"
										label={`@${challenge.creator.username}`}
										value={formatSigned(mine.creatorPoints)}
									/>
								</>
							)}
							{mine?.outcome && (
								<ChallengeFact
									size="md"
									label="Result"
									value={outcomeForSide(mine.outcome, "acceptor")}
									tone={
										mine.outcome === "ACCEPTOR"
											? "success"
											: mine.outcome === "CREATOR"
												? "danger"
												: "default"
									}
								/>
							)}
						</HStack>
					</VStack>
				</Card.Body>
			</Card>
		</Link>
	)
}
