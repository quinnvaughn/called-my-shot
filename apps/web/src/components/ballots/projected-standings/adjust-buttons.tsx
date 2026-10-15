import { FiMinus, FiPlus } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import type { Adjust } from "./types"

const stepperButtonClass = css({
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	width: "7",
	height: "7",
	borderRadius: "md",
	border: "1px solid {colors.border.default}",
	backgroundColor: "bg.surface",
	color: "fg.default",
	cursor: "pointer",
	_hover: { border: "1px solid {colors.border.emphasized}" },
	_disabled: { opacity: 0.3, cursor: "default" },
})

export function AdjustButtons({
	name,
	adjust,
}: {
	name: string
	adjust: Adjust
}) {
	return (
		<HStack gap="1" flexShrink="0">
			<button
				type="button"
				aria-label={`One fewer win for ${name}`}
				disabled={adjust.down === null}
				onClick={adjust.down ?? undefined}
				className={stepperButtonClass}
			>
				<FiMinus />
			</button>
			<button
				type="button"
				aria-label={`One more win for ${name}`}
				disabled={adjust.up === null}
				onClick={adjust.up ?? undefined}
				className={stepperButtonClass}
			>
				<FiPlus />
			</button>
		</HStack>
	)
}
