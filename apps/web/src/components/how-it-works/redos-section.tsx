import { REDO_BALANCE_CAP } from "@called-my-shot/scoring"
import { Accordion } from "#/components/ui/accordion"
import { B } from "./how-it-works-b"
import { P } from "./how-it-works-p"

export function RedosSection({ defaultOpen }: { defaultOpen: boolean }) {
	return (
		<Accordion
			id="redos"
			title="Redos"
			subtitle="The one way to change a call, and what it costs"
			defaultOpen={defaultOpen}
		>
			<P>
				A call can't normally be changed. A <B>redo</B> is the exception: it
				replaces one call's pick and conviction, and it has to be used before
				that question locks. One redo per question, ever.
			</P>
			<P>
				It isn't free and it isn't quiet. The call keeps a <B>redo</B> badge
				from then on, and its own page shows what you originally called
				alongside what you changed it to. If the call you walked away from turns
				out to have been the right one, the page says so.
			</P>
			<P>
				The cost is your <B>earliness</B>. Earliness is ranked by when a call
				was made, and a redo re-stamps that to the moment you redid it, so you
				re-enter the ranking at the back. Redoing a season-long call in October
				costs you almost nothing. Redoing twenty minutes before kickoff, once
				the news you were waiting on has broken, costs you the most.
			</P>
			<P>
				You earn redos by inviting people. Anyone who signs up on your link gets
				one straight away, and you get one once they've made their first call.
				You can hold {REDO_BALANCE_CAP} at a time; anything you earn past that
				is kept for you and arrives as soon as you spend one.
			</P>
		</Accordion>
	)
}
