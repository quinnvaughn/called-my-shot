import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { formatSigned } from "#/lib/format-number"
import type { IdentityData } from "#/lib/identity"

type Props = {
	// Null for an unranked viewer, who has no settled call this week yet.
	rank: number | null
	user: IdentityData
	points: number
	// The muted trailing count: "3 open", "2 of 3 calls", a week's label.
	note: string
	crown?: string | null
	isViewer?: boolean
}

const mono = css({ fontFamily: "mono", fontSize: "sm" })

// One member on the week race, on a single line at rail width: rank, who,
// points, then the note. No @handle - the line has no room for it beside the
// numbers, and the full board a tap away has it.
export function WeekRaceRow({
	rank,
	user,
	points,
	note,
	crown,
	isViewer = false,
}: Props) {
	return (
		<HStack
			gap="2"
			paddingBlock="1.5"
			paddingInline="2"
			marginInline="-2"
			borderRadius="md"
			bg={isViewer ? "secondary.subtle" : undefined}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "xs",
					color: "fg.subtle",
					width: "4",
					flexShrink: "0",
					textAlign: "right",
				})}
			>
				{rank ?? "-"}
			</span>
			<Avatar size="xs" name={user.name} src={user.avatarUrl} crown={crown} />
			<span
				className={css({
					fontSize: "sm",
					fontWeight: "medium",
					minWidth: "0",
					flex: "1",
					truncate: true,
				})}
			>
				{isViewer ? "You" : user.name}
			</span>
			<span className={mono}>{formatSigned(points, { zeroSign: true })}</span>
			<span
				className={css({
					textStyle: "meta",
					color: "fg.muted",
					whiteSpace: "nowrap",
					minWidth: "14",
					textAlign: "right",
				})}
			>
				{note}
			</span>
		</HStack>
	)
}
