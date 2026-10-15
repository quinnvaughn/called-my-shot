import { BASE_POINTS_BY_SHAPE } from "@called-my-shot/scoring"
import { Accordion } from "#/components/ui/accordion"
import { B } from "./how-it-works-b"
import { P } from "./how-it-works-p"

export function SeasonAwardSection() {
	return (
		<Accordion
			title="Season award scoring"
			subtitle="Each pick scored on its own"
		>
			<P>
				Each pick in a season-long award question (like First Team All-NBA) is
				scored independently, using the same contrarian-tier math as everything
				else, off the same {BASE_POINTS_BY_SHAPE.player_season_award}-point base
				as any other pick: one player might land in FEARLESS while another lands
				in SAFE, and each scores on its own rather than splitting a shared pool.
			</P>
			<P>
				Conviction can be set once for the whole question (<B>ONE FOR ALL</B>)
				or individually per pick (<B>PER PICK</B>) if you're more confident
				about some picks than others; that toggle just decides how the slider
				fills in your picks before you submit. Every pick is still stored and
				scored with its own conviction underneath.
			</P>
		</Accordion>
	)
}
