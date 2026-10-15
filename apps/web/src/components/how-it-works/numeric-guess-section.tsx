import {
	BASE_POINTS_BY_SHAPE,
	TIER_MAX_MULT,
	TIER_MIN_MULT,
} from "@called-my-shot/scoring"
import { Accordion } from "#/components/ui/accordion"
import {
	fractionWords,
	missCost,
	NUMERIC_LOSS,
	TEAM_GUESS_TARGET,
} from "#/lib/how-it-works-examples"
import { ExampleCard } from "./example-card"
import { B } from "./how-it-works-b"
import { P } from "./how-it-works-p"

export function NumericGuessSection() {
	return (
		<Accordion
			title="Numeric guess scoring"
			subtitle="The same rarity idea, applied to how close you were"
		>
			<P>
				A numeric guess doesn't have a discrete field to compare against the way
				an option-based shape does, so it can't use field share directly. It
				asks the same underlying question a different way instead: once a
				question resolves, how much of the <B>whole field's conviction</B> (not
				just the people who also hit) guessed at least as close to the actual
				result as you did? The smaller that share, the higher your multiplier,
				scaling smoothly on the exact same{" "}
				<B>
					×{TIER_MIN_MULT} to ×{TIER_MAX_MULT}
				</B>{" "}
				curve as the contrarian tier.
			</P>
			<P>
				That's a deliberate choice: if half the field also landed on the same
				close answer (a low-count stat like steals, where a lot of people will
				correctly guess a small number), that's not a rare read and shouldn't
				score like one; everyone tied at that distance sits near the ×
				{TIER_MIN_MULT} floor, the same as a popular option pick. If you're the
				only one who landed that close on a harder, wider-ranging stat, that's
				genuinely rare, and it scores like it. It stacks with the same
				early-call bonus as every other type.
			</P>
			<ExampleCard
				label="Formula: numeric guess"
				rows={[
					{
						term: "COMMITTED",
						expr: `${BASE_POINTS_BY_SHAPE.player_stat_numeric_guess} × conviction% = committed points`,
					},
					{
						term: "IF HIT",
						expr: `committed × rarity (×${TIER_MIN_MULT}-×${TIER_MAX_MULT}) × early bonus`,
					},
					{ term: "IF MISS", expr: `−committed × ${NUMERIC_LOSS}` },
				]}
			/>
			<P>
				You don't need to land on the exact number to hit; that part hasn't
				changed. Each stat carries its own tolerance band, based on how it's
				typically distributed: a low-count stat like blocks or steals gets a
				wider band (currently 15%) than a high-volume stat like yards or a
				player's points (currently 10%). A team's final score gets a fixed band
				instead, since how much a score swings doesn't track how big it is. That
				band is sized from recent final scores so a guess at a team's own
				average lands inside it about {fractionWords(TEAM_GUESS_TARGET)} of the
				time, and it adjusts as the season goes. Before the question resolves,
				the app shows that as an approximate number so it's easier to read.
				Missing the band costs {missCost(NUMERIC_LOSS)}, flat: there's no
				partial credit for close but not close enough.
			</P>
		</Accordion>
	)
}
