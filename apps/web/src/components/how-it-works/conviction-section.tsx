import { Accordion } from "#/components/ui/accordion"
import { ExampleCard } from "./example-card"
import { B } from "./how-it-works-b"
import { P } from "./how-it-works-p"

export function ConvictionSection() {
	return (
		<Accordion
			title="Conviction"
			subtitle="How much of the question's points you're committing"
		>
			<P>
				Every question type has a fixed base point value. When you make a call,
				you set your <B>conviction</B>, anywhere from 1% to 100%, for how much
				of that value you're actually putting behind the pick. This is separate
				from how bold the pick itself is; what you picked sets the multiplier
				below, conviction just decides how much of it is in play.
			</P>
			<P>
				Low conviction means a small win or small loss either way. Full
				conviction means the whole multiplier is at risk.
			</P>
			<ExampleCard
				label="Formula"
				rows={[
					{
						term: "COMMITTED",
						expr: "base points × conviction% = committed points",
					},
				]}
			/>
		</Accordion>
	)
}
