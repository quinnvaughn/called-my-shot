import { css } from "styled-system/css"
import { Tag } from "#/components/ui/tag"
import { ordinal } from "#/lib/streak-meta"

type Props = {
	// The run's length as of this call.
	length: number
	// "NFL Player Stats"
	track: string
}

// "7 in a row" on a winning call that was at least STREAK_TAG_MIN into its
// streak. The tag doesn't say which streak, so the wrapper carries the full
// sentence a screen reader announces instead.
export function StreakTag({ length, track }: Props) {
	const label = `${ordinal(length)} straight correct ${track} call`
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
