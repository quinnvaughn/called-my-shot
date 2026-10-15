import {
	SEASON_PLAY_FLOOR,
	SEASON_PLAY_FULL_SHARE,
	SEASON_PLAY_WEEK_MIN_CALLS,
} from "@called-my-shot/scoring"
import { Accordion } from "#/components/ui/accordion"
import { P } from "./how-it-works-p"

export function SeasonLongCallsSection() {
	return (
		<Accordion
			title="Season-long calls"
			subtitle="Worth more the more weeks you play"
		>
			<P>
				A season-long call settles once, at the end, so what it's worth depends
				on how regularly you play that league. A week counts once you make{" "}
				{SEASON_PLAY_WEEK_MIN_CALLS} game calls in that league. Play{" "}
				{Math.round(SEASON_PLAY_FULL_SHARE * 100)}% or more of the weeks that
				have had games to call here and your season-long calls count in full.
				Below that they scale down evenly, to as little as{" "}
				{Math.round(SEASON_PLAY_FLOOR * 100)}% of their points if you never play
				the league.
			</P>
			<P>
				It scales the hit and the miss alike, and it's set when the question
				resolves, so the weeks after you make a season-long call still count.
				Only regular-season weeks with games count, and the week in progress
				counts as soon as you've played it.
			</P>
		</Accordion>
	)
}
