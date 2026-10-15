import { useState } from "react"

/**
 * The text behind a typed number input, kept as a raw buffer rather than
 * derived straight from `value`: round tripping "24." through Number() on
 * every keystroke would drop the trailing "." and make the fractional part
 * impossible to ever type.
 *
 * The buffer resyncs only when `value` changes from outside (a stepper click,
 * a cleared field, a form reset). Typing that parses to the value already
 * held, like the "." in "24.", leaves the buffer as typed.
 */
export function useBufferedNumberText({
	value,
	onChange,
	allowDecimal,
}: {
	value: number | undefined
	onChange: (value: number | undefined) => void
	allowDecimal: boolean
}) {
	const [text, setText] = useState(() => String(value ?? ""))
	const [syncedValue, setSyncedValue] = useState(value)
	if (!Object.is(value, syncedValue)) {
		setSyncedValue(value)
		setText(String(value ?? ""))
	}

	function onTextChange(raw: string) {
		// Digits only, plus a single decimal point where one is allowed.
		let cleaned = raw.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, "")
		const firstDot = cleaned.indexOf(".")
		if (firstDot !== -1) {
			cleaned =
				cleaned.slice(0, firstDot + 1) +
				cleaned.slice(firstDot + 1).replace(/\./g, "")
		}
		setText(cleaned)
		const parsed = Number(cleaned)
		// Empty commits as undefined, not 0, so a required number left blank
		// fails validation instead of silently submitting a real zero.
		onChange(
			cleaned === "" || cleaned === "." || Number.isNaN(parsed)
				? undefined
				: parsed,
		)
	}

	return { text, onTextChange }
}
