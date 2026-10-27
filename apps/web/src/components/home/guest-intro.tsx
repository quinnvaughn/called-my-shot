import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { BlindRankHubCard } from "#/components/arcade/blind-rank/blind-rank-hub-card"
import { NameThatSeasonHubCard } from "#/components/arcade/name-that-season/name-that-season-hub-card"
import { TeammateChainHubCard } from "#/components/arcade/teammate-chain/teammate-chain-hub-card"
import { StartGroupForm } from "#/components/groups/start-group-form"

// The top of Home for a signed-out visitor, in place of the page header: what
// a group is for and the form to name one, then today's puzzles, which play
// without an account.
export function GuestIntro() {
	return (
		<VStack gap="6" alignItems="stretch">
			<VStack gap="3" alignItems="flex-start">
				<h1
					className={css({
						fontFamily: "heading",
						fontSize: { base: "3xl", lg: "4xl" },
						lineHeight: "tight",
						letterSpacing: "tight",
					})}
				>
					Find out who in your group actually knows sports.
				</h1>
				<p className={css({ lineHeight: "relaxed", color: "fg.body" })}>
					Start a group and send the link. Everyone plays the same daily sports
					puzzles and calls the same real games, and the group's boards keep
					score.
				</p>
			</VStack>
			<VStack gap="3" alignItems="stretch">
				<StartGroupForm surface="home_intro" />
				<p className={css({ color: "fg.subtle", textStyle: "metaLg" })}>
					free · no money, ever
				</p>
			</VStack>
			<div
				className={css({
					display: "grid",
					gridTemplateColumns: { base: "1fr", lg: "1fr 1fr" },
					gap: "4",
				})}
			>
				<NameThatSeasonHubCard />
				<BlindRankHubCard />
				<div className={css({ display: "grid", gridColumn: { lg: "1 / -1" } })}>
					<TeammateChainHubCard />
				</div>
			</div>
		</VStack>
	)
}
