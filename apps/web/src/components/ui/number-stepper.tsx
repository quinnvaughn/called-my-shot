import { useState } from "react"
import { FiMinus, FiPlus } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { useBufferedNumberText } from "#/hooks/use-buffered-number-text"
import { ChipButton } from "./chip-button"

// Guards against floating-point drift from repeated decimal stepping (e.g.
// 0.27 + 0.01 landing on 0.28000000000000003) - rounds to the same 3 decimal
// places the columns behind these values store.
function round3(value: number): number {
	return Math.round(value * 1000) / 1000
}

export const stepButtonStyle = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "11",
	height: "11",
	flexShrink: "0",
	borderRadius: "lg",
	border: "1px solid {colors.border.default}",
	color: "fg.subtle",
	cursor: "pointer",
	_hover: {
		border: "1px solid {colors.border.emphasized}",
		color: "fg.default",
	},
})

// Underlined rather than bare: without it the number reads as display text on
// a form where every other field is a bordered box, and nothing says you can
// type in it.
const valueInputStyle = css({
	flexShrink: "0",
	textAlign: "center",
	fontFamily: "heading",
	fontSize: "4xl",
	background: "transparent",
	border: "none",
	borderBottom: "1px solid {colors.border.default}",
	outline: "none",
	color: "fg.default",
	cursor: "text",
	_placeholder: { color: "fg.subtle" },
	_focus: { borderBottom: "1px solid {colors.primary.default}" },
})

const unitStyle = css({
	textStyle: "label",
	color: "fg.subtle",
})

const stepLabelStyle = css({
	fontFamily: "mono",
	fontSize: "3xs",
	letterSpacing: "wide",
	color: "fg.subtle",
})

type Props = {
	value: number | undefined
	onChange: (value: number | undefined) => void
	onBlur?: () => void
	// The step sizes offered as chips. The first is selected initially, so put
	// the everyday one first and the coarse jumps after it.
	stepSizes: readonly number[]
	// "half" pins every committed value to x.5, which is what makes a whole
	// number unreachable rather than merely rejected - see snapValue below.
	// "none" leaves the typed/stepped value alone.
	snap: "half" | "none"
	min: number
	// Rendered under the number, labelling what's being counted.
	unit?: string | null
	placeholder?: string
	inputMode?: "numeric" | "decimal"
	ariaLabel: string
	describedBy?: string
	hasError?: boolean
}

// A number entry built for setting a betting-style line: a big centered value
// with -/+ buttons and selectable step sizes, rather than a native number
// input whose 1-at-a-time spinner is useless for a 249.5-yard line.
//
// Controlled and form-agnostic on purpose - the only state it owns is which
// step chip is active (pure UI) and a text buffer for in-progress typing.
export function NumberStepper({
	value,
	onChange,
	onBlur,
	stepSizes,
	snap,
	min,
	unit,
	placeholder,
	inputMode = "decimal",
	ariaLabel,
	describedBy,
	hasError,
}: Props) {
	const [stepSize, setStepSize] = useState(() => stepSizes[0] ?? 1)
	// Snapping waits for blur - snapping mid-keystroke would fight every
	// character typed.
	const { text, onTextChange } = useBufferedNumberText({
		value,
		onChange,
		allowDecimal: true,
	})

	// The half point at or just above the integer part - legal for anything
	// coming in, whole or fractional. Floor rather than round-to-nearest
	// because rounding 224.9 up would land on 225, the exact kind of whole
	// number "half" exists to rule out.
	function snapValue(raw: number): number {
		return match(snap)
			.with("half", () => Math.floor(raw) + 0.5)
			.with("none", () => round3(raw))
			.exhaustive()
	}

	function commit(raw: number) {
		onChange(Math.max(min, snapValue(raw)))
	}

	function stepBy(direction: 1 | -1) {
		commit(round3((value ?? min) + direction * stepSize))
	}

	function handleBlur() {
		if (value !== undefined) commit(value)
		onBlur?.()
	}

	return (
		<VStack gap="3" alignItems="center">
			<VStack gap="1" alignItems="center">
				<HStack gap="3" alignItems="center" justify="center">
					<button
						type="button"
						aria-label={`Decrease ${ariaLabel.toLowerCase()}`}
						onClick={() => stepBy(-1)}
						className={stepButtonStyle}
					>
						<FiMinus size={18} />
					</button>
					<input
						type="text"
						inputMode={inputMode}
						aria-label={ariaLabel}
						aria-describedby={describedBy}
						aria-invalid={hasError || undefined}
						value={text}
						placeholder={placeholder}
						onChange={(e) => onTextChange(e.target.value)}
						onBlur={handleBlur}
						// ch tracks the actual character count so a 3-digit
						// passing-yards line gets more room than a 2-digit rebounds
						// one, instead of both fighting a fixed width.
						style={{
							width: `${Math.max(placeholder?.length ?? 4, text.length) + 1}ch`,
						}}
						className={valueInputStyle}
					/>
					<button
						type="button"
						aria-label={`Increase ${ariaLabel.toLowerCase()}`}
						onClick={() => stepBy(1)}
						className={stepButtonStyle}
					>
						<FiPlus size={18} />
					</button>
				</HStack>
				{unit && <span className={unitStyle}>{unit}</span>}
			</VStack>
			<HStack gap="2" justify="center">
				<span className={stepLabelStyle}>STEP</span>
				<HStack gap="1.5">
					{stepSizes.map((size) => (
						<ChipButton
							key={size}
							selected={stepSize === size}
							pressed={stepSize === size}
							onClick={() => setStepSize(size)}
						>
							±{size}
						</ChipButton>
					))}
				</HStack>
			</HStack>
		</VStack>
	)
}
