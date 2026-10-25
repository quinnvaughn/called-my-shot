import { css } from "styled-system/css"
import { pluralize } from "#/lib/pluralize"

// How many characters a field has left, shown only once it's close to
// running out.
export function RoomLeft({
	value,
	max,
	within = 40,
}: {
	value: string
	max: number
	// Shown from this many characters left.
	within?: number
}) {
	const left = max - value.length
	if (left > within) return null
	return (
		<span
			className={css({
				textStyle: "meta",
				color: left <= 0 ? "danger.default" : "fg.muted",
			})}
		>
			{Math.max(0, left)} {pluralize(left, "character")} left
		</span>
	)
}
