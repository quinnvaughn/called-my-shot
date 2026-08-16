import { css, cx } from "styled-system/css"

type Props = {
	value: number
	onChange: (value: number) => void
	min?: number
	max?: number
	className?: string
	"aria-label"?: string
}

const trackStyle = css({
	width: "full",
	accentColor: "primary.default",
	cursor: "pointer",
})

// Thin wrapper around a native range input - no slider primitive existed
// yet, and one control isn't worth pulling in a dependency for. Native
// range inputs already give us keyboard support, touch dragging, and
// accent-color theming for free.
export function Slider({
	value,
	onChange,
	min = 1,
	max = 100,
	className,
	"aria-label": ariaLabel,
}: Props) {
	return (
		<input
			type="range"
			min={min}
			max={max}
			value={value}
			onChange={(e) => onChange(Number(e.target.value))}
			aria-label={ariaLabel}
			className={cx(trackStyle, className)}
		/>
	)
}
