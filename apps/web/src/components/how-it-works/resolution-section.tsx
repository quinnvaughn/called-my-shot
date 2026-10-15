import { Accordion } from "#/components/ui/accordion"
import { B } from "./how-it-works-b"
import { P } from "./how-it-works-p"

export function ResolutionSection({ defaultOpen }: { defaultOpen: boolean }) {
	return (
		<Accordion
			id="resolution"
			title="Resolution"
			subtitle="Manual, sourced, and disputable"
			defaultOpen={defaultOpen}
		>
			<P>
				Every question resolves against a source stated when it's created: a
				link or a plain description of where the answer was checked (a box
				score, an official league page, wherever fits). There's no fixed source
				list; it's disclosure, not an automated feed.
			</P>
			<P>
				Resolution is manual: the question's creator marks the outcome once it's
				official. That publishes immediately to every caller.
			</P>
			<P>
				If a result looks wrong, any caller who made a call on that question can
				dispute it with a reason once it's resolved. Filing a dispute moves the
				question to a <B>disputed</B> state while our team reviews it. They
				either uphold the original resolution or overturn it and correct the
				result; either way, the question moves back to resolved once it's
				settled.
			</P>
		</Accordion>
	)
}
