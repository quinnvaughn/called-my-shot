import { css } from "styled-system/css"
import { BlindRankHubCard } from "#/components/arcade/blind-rank/blind-rank-hub-card"
import { NameThatSeasonHubCard } from "#/components/arcade/name-that-season/name-that-season-hub-card"
import type { GuestPickCandidate } from "../guest-picks/select-guest-picks"
import { LandingPageContentSection } from "../landing-page-content-section"
import { CallsHubCard } from "./calls-hub-card"

// Everything there is to play today, one card each, all of it open to a
// visitor without an account. A new game is a new card here.
export function LandingPageToday({
	questions,
}: {
	questions: GuestPickCandidate[]
}) {
	return (
		<LandingPageContentSection
			alt
			id="today"
			eyebrow="Today"
			title="Play today's games. No account needed."
			description="Two new puzzles every day, plus calls on real games. Sign up after you play and today still counts."
		>
			<div
				className={css({
					display: "grid",
					gridTemplateColumns: { base: "1fr", lg: "repeat(3, 1fr)" },
					gap: "5",
					width: "full",
				})}
			>
				<NameThatSeasonHubCard />
				<BlindRankHubCard />
				<CallsHubCard questions={questions} />
			</div>
		</LandingPageContentSection>
	)
}
