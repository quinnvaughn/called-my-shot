import { Accordion } from "#/components/ui/accordion"
import { B } from "./how-it-works-b"
import { P } from "./how-it-works-p"

export function NumbersSection() {
	return (
		<Accordion
			title="How the numbers are set"
			subtitle="No one's adjusting anything against you"
		>
			<P>
				The number, the options, the award name: all of it set by whoever asked
				the question, not calculated by the platform to balance action on both
				sides. Nobody's adjusting anything based on which way callers are
				leaning.
			</P>
			<P>
				On a question with no price of its own, your multiplier comes from the{" "}
				<B>field</B> (the real share of other callers' conviction on the same
				thing you picked), not from anything set ahead of time. It only exists
				after people have actually called.
			</P>
			<P>
				When you miss, those points aren't going anywhere: there's no other side
				of the call collecting them. And every question resolves against a
				real-world result, not a number anyone's trying to manipulate.
			</P>
		</Accordion>
	)
}
