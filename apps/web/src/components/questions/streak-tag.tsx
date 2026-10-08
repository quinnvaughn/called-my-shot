import { css } from "styled-system/css"
import { Tag } from "#/components/ui/tag"
import { ordinal } from "#/lib/streak-meta"

type Props = {
	// The run's length as of this call.
	length: number
	// "NFL Player Stats"
	track: string
	// What a screen reader announces in place of the winning-call sentence,
	// for a tag standing in front of a call not yet made.
	label?: string
}

// "7 in a row" on a winning call that was at least STREAK_TAG_MIN into its
// streak. The tag doesn't say which streak, so the wrapper carries the full
// sentence a screen reader announces instead.
export function StreakTag({ length, track, label: labelProp }: Props) {
	const label = labelProp ?? `${ordinal(length)} straight correct ${track} call`
	return (
		<span
			role="img"
			aria-label={label}
			title={label}
			className={css({ display: "inline-flex" })}
		>
			<Tag variant="success" size="sm">{`${length} in a row`}</Tag>
		</span>
	)
}
