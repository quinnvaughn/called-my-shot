import { FiMinus, FiPlus } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { FormError } from "#/components/ui/form-error"
import { stepButtonStyle } from "#/components/ui/number-stepper"
import { useBufferedNumberText } from "#/hooks/use-buffered-number-text"
import { roundGuess } from "#/lib/field-signal"

const guessUnitStyle = css({
	textStyle: "label",
	color: "fg.subtle",
	border: "1px solid {colors.border.default}",
	borderRadius: "sm",
	paddingInline: "2",
	paddingBlock: "1",
})

// Pulled out to its own top-level component (rather than a closure inside
// form.Field's render callback) because it needs its own hooks - the typed
// guess lives in a raw text buffer (see useBufferedNumberText), and only a
// rate stat (batting average, ERA) takes a decimal point.
export function GuessValueInput({
	value,
	onChange,
	onBlur,
	error,
	guessStep,
	isRateStat,
	guessUnit,
}: {
	value: number | undefined
	onChange: (value: number | undefined) => void
	onBlur: () => void
	error: string | null
	guessStep: number
	isRateStat: boolean
	guessUnit: string | null
}) {
	const { text, onTextChange } = useBufferedNumberText({
		value,
		onChange,
		allowDecimal: isRateStat,
	})

	return (
		<VStack gap="3" alignItems="center">
			{/* Tight on purpose - the unit is labeling the number right above
			it, not an independent block, so it gets its own small gap instead
			of inheriting the card's looser one. */}
			<VStack gap="1" alignItems="center">
				<HStack gap="3" alignItems="center" justify="center">
					<button
						type="button"
						aria-label="Decrease guess"
						onClick={() =>
							onChange(Math.max(0, roundGuess((value ?? 0) - guessStep)))
						}
						className={stepButtonStyle}
					>
						<FiMinus size={18} />
					</button>
					<input
						type="text"
						inputMode={isRateStat ? "decimal" : "numeric"}
						pattern={isRateStat ? undefined : "[0-9]*"}
						aria-label="Your guess"
						value={text}
						onChange={(e) => onTextChange(e.target.value)}
						// Select-all on focus so typing replaces the current guess
						// instead of appending to it. Deferred a frame because the
						// click that focused the input would otherwise place the
						// caret after select() runs and collapse the selection.
						onFocus={(e) => {
							const input = e.currentTarget
							requestAnimationFrame(() => input.select())
						}}
						onBlur={onBlur}
						// ch tracks the actual character count (min 2) so a
						// 3-digit passing-yards guess gets more room than a
						// 2-digit rebounds one, or a rate-stat guess room for
						// its decimal point, instead of all of them fighting a
						// fixed width.
						style={{
							width: `${Math.max(2, text.length) + 1}ch`,
						}}
						className={css({
							flexShrink: "0",
							textAlign: "center",
							fontFamily: "heading",
							fontSize: "5xl",
							background: "transparent",
							border: "none",
							outline: "none",
							color: "fg.default",
						})}
					/>
					<button
						type="button"
						aria-label="Increase guess"
						onClick={() => onChange(roundGuess((value ?? 0) + guessStep))}
						className={stepButtonStyle}
					>
						<FiPlus size={18} />
					</button>
				</HStack>
				{guessUnit && <span className={guessUnitStyle}>{guessUnit}</span>}
			</VStack>
			<FormError message={error} />
		</VStack>
	)
}
