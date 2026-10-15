import { Accordion } from "#/components/ui/accordion"
import { P } from "./how-it-works-p"
import { TypeGrid } from "./type-grid"

export function QuestionTypesSection() {
	return (
		<Accordion
			title="Question types"
			subtitle="Different formats, different base points"
		>
			<P>Base points vary by shape: harder-to-call formats are worth more.</P>
			<TypeGrid />
		</Accordion>
	)
}
