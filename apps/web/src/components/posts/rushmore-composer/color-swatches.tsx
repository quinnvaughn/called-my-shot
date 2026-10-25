import { PROMPT_COLORS, type PromptColorHex } from "@called-my-shot/schemas"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { FieldLabel } from "#/components/ui/field-label"

const swatch = css({
	width: "8",
	height: "8",
	borderRadius: "full",
	cursor: "pointer",
	border: "1px solid {colors.border.default}",
	transition: "transform 0.1s ease",
	_hover: { transform: "scale(1.08)" },
	_focusVisible: {
		outline: "2px solid {colors.primary.default}",
		outlineOffset: "2px",
	},
})

const picked = css({
	outline: "2px solid {colors.fg.default}",
	outlineOffset: "2px",
})

// The color a prompt's Rushmores are drawn in, from the set every share
// image reads well on.
export function ColorSwatches({
	value,
	onChange,
}: {
	value: PromptColorHex
	onChange: (color: PromptColorHex) => void
}) {
	return (
		<VStack gap="1.5" alignItems="stretch">
			<FieldLabel>Color</FieldLabel>
			<HStack gap="2.5" flexWrap="wrap" paddingBlock="1">
				{PROMPT_COLORS.map((color) => (
					<button
						key={color.hex}
						type="button"
						aria-label={color.name}
						aria-pressed={color.hex === value}
						title={color.name}
						className={cx(swatch, color.hex === value && picked)}
						style={{ backgroundColor: color.hex }}
						onClick={() => onChange(color.hex)}
					/>
				))}
			</HStack>
		</VStack>
	)
}
