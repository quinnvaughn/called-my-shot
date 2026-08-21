import { FaTriangleExclamation } from "react-icons/fa6"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"

// A dispute is only ever filed against an already-resolved question - this
// is just the "under review" interrupt; the prior resolution itself still
// renders normally below it (QuestionCard's result block, CallCard's pick).
export function DisputedFlag() {
	return (
		<HStack
			gap="1.5"
			alignItems="center"
			className={css({ fontSize: "xs", color: "warning.default" })}
		>
			<FaTriangleExclamation size={12} className={css({ flexShrink: "0" })} />
			<span>Disputed — under review</span>
		</HStack>
	)
}
