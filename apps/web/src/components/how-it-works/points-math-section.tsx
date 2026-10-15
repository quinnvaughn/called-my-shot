import {
	COMMUNITY_POINTS_MULT,
	EARLY_MAX_MULT,
	LOSS_RATE_BY_SHAPE,
	SEASON_EARLY_MAX_MULT,
	SIDE_LOSS_RATE_BOUNDS,
	SIDE_WIN_MULT_MAX,
	TIER_MAX_MULT,
	TIER_MIN_MULT,
	USER_LINE_CHANCE_BOUNDS,
} from "@called-my-shot/scoring"
import { Accordion } from "#/components/ui/accordion"
import {
	EXAMPLE_BASE,
	EXAMPLE_EARLY_MULT,
	HIT_COMMITTED,
	HIT_POINTS,
	MISS_COMMITTED,
	MISS_POINTS,
	MULTI_AWARD_LOSS,
	missCost,
	NUMERIC_LOSS,
	SEASON_LEADER_LOSS,
	SINGLE_AWARD_LOSS,
} from "#/lib/how-it-works-examples"
import { CurveScale } from "./curve-scale"
import { ExampleCard } from "./example-card"
import { B } from "./how-it-works-b"
import { P } from "./how-it-works-p"

export function PointsMathSection() {
	return (
		<Accordion
			title="How points are calculated"
			subtitle="Committed points × multiplier, worked examples"
		>
			<P>
				Put together, a win is:{" "}
				<B>committed points × contrarian tier × early-call bonus</B>, a second
				multiplier that rewards calling before the field has mostly made up its
				mind. It's based on where your call landed in the field's final call
				order (not the clock), scales smoothly the same way the contrarian tier
				does, and only ever helps, never hurts:
			</P>
			<CurveScale
				labels={["STANDARD", "AHEAD OF THE CURVE", "EARLY", "FIRST MOVER"]}
				floorMult="×1"
				ceilingMult={`×${EARLY_MAX_MULT}`}
			/>
			<P>
				That call-order version is for single-game questions. A question that
				spans a season (a season-long stat line, award finalists, or a
				season-long award) can't use call order the same way, since calls
				trickle in unevenly over months rather than filling up in an hour;
				instead it's based on <B>how much of the season had been played</B> when
				you called, on a wider range since a whole season's worth of unknowns is
				a bigger gap than a few hours of other people's takes:
			</P>
			<CurveScale
				labels={["STANDARD", "EARLY SEASON", "FIRST QUARTER", "PRESEASON"]}
				floorMult="×1"
				ceilingMult={`×${SEASON_EARLY_MAX_MULT}`}
			/>
			<P>
				A miss is <B>−committed points × loss rate</B>, flat, regardless of
				either multiplier. The loss rate is set by question type and saved on
				the question when it's posted, so it can't change after you call. Stat
				lines, yes/no, and head-to-head picks lose{" "}
				{missCost(LOSS_RATE_BY_SHAPE.yes_no_prop)}, except where the two sides
				are priced: a game's winner, a player head-to-head on one game, and a
				game stat line someone set by hand. Each side is priced from how likely
				the players' or teams' history makes it, so picking either side without
				any edge still comes out slightly ahead over time. The likelier side's
				hit pays what you committed, and its miss loses more, up to{" "}
				{SIDE_LOSS_RATE_BOUNDS.max}× what you committed. The other side still
				loses {missCost(LOSS_RATE_BY_SHAPE.yes_no_prop)} on a miss, and its hit
				pays more, up to {SIDE_WIN_MULT_MAX}× what you committed before either
				multiplier. A side too unlikely for that to cover loses less on a miss
				instead. A numeric guess loses {missCost(NUMERIC_LOSS)}. A game stat
				leader pick loses a share sized per stat so picking the player with the
				best season average comes out slightly ahead, and a season stat leader
				pick loses {missCost(SEASON_LEADER_LOSS)}. A single-pick season award
				loses {missCost(SINGLE_AWARD_LOSS)}, and each wrong pick on an award
				with several picks loses {missCost(MULTI_AWARD_LOSS)}. A title pick
				loses a share sized per league so picking the best regular-season record
				comes out slightly ahead, and a finalists pick loses a share sized so a
				pick at random among the finalists comes out slightly ahead. Everything
				past a two-option pick misses far more often than it hits, and the
				rarity multiplier can't make up for that when only a few people have
				called.
			</P>
			<P>
				A stat line or head-to-head someone writes is priced the same way as
				ours, so it scores the same as ours. It has to be one the model reads as
				close: if it gives either side less than{" "}
				{Math.round(USER_LINE_CHANCE_BOUNDS.min * 100)}% or more than{" "}
				{Math.round(USER_LINE_CHANCE_BOUNDS.max * 100)}%, it isn't accepted,
				since past that the likelier side's miss can't cost enough to stay fair.
				A question someone writes that can't be priced scores at{" "}
				{Math.round(COMMUNITY_POINTS_MULT * 100)}% of its base.
			</P>

			<ExampleCard
				label="Worked example: hit, near-fearless rarity"
				rows={[
					{
						term: "COMMITTED",
						expr: `${EXAMPLE_BASE} × 60% = ${HIT_COMMITTED}`,
					},
					{
						term: "IF RIGHT",
						expr: `${HIT_COMMITTED} × ${TIER_MAX_MULT} × ${EXAMPLE_EARLY_MULT} = +${HIT_POINTS.toLocaleString("en-US")}`,
					},
				]}
				note={`≈×${TIER_MAX_MULT} boldness (barely anyone else picked it) · ≈×${EXAMPLE_EARLY_MULT} early bonus (called in the earliest quarter of the field, by call order)`}
			/>
			<ExampleCard
				label="Worked example: miss, safe pick"
				rows={[
					{
						term: "COMMITTED",
						expr: `${EXAMPLE_BASE} × 70% = ${MISS_COMMITTED}`,
					},
					{
						term: "RESULT",
						expr: `missed → −${MISS_POINTS.toLocaleString("en-US")}`,
					},
				]}
				note={`tier was ≈×${TIER_MIN_MULT} anyway (a popular pick), but it's irrelevant here; the multiplier never applies to a miss`}
			/>

			<P>
				There's no floor at zero on your total score: enough confident misses
				and your point total can go negative. That's the point: the leaderboard
				only differentiates skill if being wrong actually shows up.
			</P>
		</Accordion>
	)
}
