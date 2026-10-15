import { Link } from "@tanstack/react-router"
import { DateTime } from "luxon"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { RecordStat } from "#/components/records/record-stat"
import { Identity } from "#/components/ui/identity"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { formatSigned } from "#/lib/format-number"
import { formatRecord } from "#/lib/game-status"
import { toIdentity } from "#/lib/identity"

export const GroupBallotEntryRowFragment = graphql(`
	fragment GroupBallotEntryRow_entry on GroupBallotEntry {
		user {
			id
			...Identity_user
		}
		calledCount
		wins
		losses
		points
		completedAt
	}
`)

type Props = {
	ballotSlug: string
	memberCount: number
	groupId: string
	entry: FragmentType<typeof GroupBallotEntryRowFragment>
	isViewer: boolean
	// Whether any member on the board has a settled pick. Every row then
	// shows points, so the column lines up down the board.
	showPoints: boolean
}

const metaClass = css({
	textStyle: "metaLg",
	color: "fg.subtle",
	whiteSpace: "nowrap",
})

// One member on the group ballot board: who, how far through the ballot
// they are or when they finished, and once picks settle, their record and
// points. The whole row opens their entry.
export function GroupBallotEntryRow({
	ballotSlug,
	memberCount,
	groupId,
	entry: entryProp,
	isViewer,
	showPoints,
}: Props) {
	const entry = useFragment(GroupBallotEntryRowFragment, entryProp)
	const user = toIdentity(entry.user)
	const progress = entry.completedAt
		? `Finished ${DateTime.fromISO(entry.completedAt).toRelative()}`
		: `${entry.calledCount} of ${memberCount} called`

	return (
		<Link
			to="/ballots/$ballotSlug/$username"
			params={{ ballotSlug, username: user.username }}
			search={{ group: groupId }}
			className={css({
				display: "block",
				textDecoration: "none",
				color: "inherit",
				borderRadius: "xl",
				paddingInline: "4",
				paddingBlock: "3",
				bg: "bg.surface",
				transition: "border-color 0.15s ease",
				border: isViewer
					? "1px solid {colors.secondary.default}"
					: "1px solid {colors.border.default}",
				_hover: { border: "1px solid {colors.border.emphasized}" },
			})}
		>
			<HStack justify="space-between" alignItems="center" gap="4">
				<VStack gap="1.5" alignItems="flex-start" minWidth="0">
					<Identity
						name={user.name}
						username={user.username}
						avatarUrl={user.avatarUrl}
						flair={user.flair}
					/>
					<span className={metaClass}>
						{progress}
						{entry.wins + entry.losses > 0 &&
							` · ${formatRecord(entry.wins, entry.losses)}`}
					</span>
				</VStack>
				{showPoints ? (
					<RecordStat
						value={formatSigned(entry.points, { zeroSign: true })}
						label="Points"
						tone={entry.points >= 0 ? "success" : "danger"}
					/>
				) : (
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "sm",
							fontWeight: "bold",
							color: entry.completedAt ? "fg.default" : "fg.muted",
							whiteSpace: "nowrap",
						})}
					>
						{entry.calledCount}/{memberCount}
					</span>
				)}
			</HStack>
		</Link>
	)
}
