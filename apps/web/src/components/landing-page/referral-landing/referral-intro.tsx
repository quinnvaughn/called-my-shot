import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { LeaderboardEntryCard } from "#/components/leaderboard/leaderboard-entry-card"
import { toIdentity } from "#/lib/identity"
import type { ReferralInviter } from "./types"

export function ReferralIntro({ inviter }: { inviter: ReferralInviter }) {
	const identity = toIdentity(inviter)
	const stats = inviter.careerStats

	return (
		<VStack alignItems="stretch" gap="5" className={css({ gridArea: "intro" })}>
			<LeaderboardEntryCard
				eyebrow="Overall rank"
				unrankedLabel="No resolved calls yet"
				entry={{
					rank: stats?.rank ?? null,
					totalPoints: stats?.totalPoints ?? 0,
					resolvedCallCount: stats?.resolvedCallCount ?? 0,
					accuracy: stats?.accuracy ?? null,
					user: identity,
				}}
			/>
			<h1
				className={css({
					fontFamily: "heading",
					fontSize: { base: "3xl", lg: "4xl" },
					lineHeight: "tight",
					letterSpacing: "tight",
				})}
			>
				@{inviter.username} invited you.
			</h1>
			<p className={css({ lineHeight: "relaxed", color: "fg.body" })}>
				Make calls on NFL, NBA, MLB and NHL games and whole seasons. Every call
				lands on your public record, scored against everyone else who called it.
			</p>
		</VStack>
	)
}
