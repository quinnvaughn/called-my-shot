import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { RecordStat } from "#/components/records/record-stat"
import { Identity } from "#/components/ui/identity"
import { Tag } from "#/components/ui/tag"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { formatPayout } from "#/lib/call-summary"
import { formatSigned } from "#/lib/format-number"
import { formatRecord } from "#/lib/game-status"
import { toIdentity } from "#/lib/identity"
import { pluralize } from "#/lib/pluralize"

export const GroupGameEntryRowFragment = graphql(`
	fragment GroupGameEntryRow_entry on GroupGameEntry {
		user {
			id
			...Identity_user
		}
		calledCount
		wins
		losses
		points
		openCount
		openPayout {
			winLow
			winHigh
			lose
		}
		presser {
			id
			isOpen
			answeredCount
		}
	}
`)

type Props = {
	gameId: string
	groupId: string
	entry: FragmentType<typeof GroupGameEntryRowFragment>
	isViewer: boolean
}

const metaClass = css({
	textStyle: "metaLg",
	color: "fg.subtle",
	whiteSpace: "nowrap",
})

// One member on the group game board: who, how many calls, the record and
// points settled so far, and what the calls still waiting on a result add up
// to either way. The whole row opens their full picks on the game.
export function GroupGameEntryRow({
	gameId,
	groupId,
	entry: entryProp,
	isViewer,
}: Props) {
	const entry = useFragment(GroupGameEntryRowFragment, entryProp)
	const user = toIdentity(entry.user)
	const hasResults = entry.wins + entry.losses > 0 || entry.points !== 0
	const payout = entry.openPayout ? formatPayout(entry.openPayout) : null
	// Their presser on this game, once it's open: still taking questions, or
	// how much of it they answered.
	const presserLabel = !entry.presser
		? null
		: entry.presser.isOpen
			? "Presser open"
			: entry.presser.answeredCount > 0
				? `Presser · ${entry.presser.answeredCount} answered`
				: null

	return (
		<Link
			to="/games/$gameId/picks/$username"
			params={{ gameId, username: user.username }}
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
					{presserLabel && (
						<Tag variant="secondary" size="sm">
							{presserLabel}
						</Tag>
					)}
					<span className={metaClass}>
						{entry.calledCount} {pluralize(entry.calledCount, "call")}
						{entry.wins + entry.losses > 0 &&
							` · ${formatRecord(entry.wins, entry.losses)}`}
					</span>
					{entry.openCount > 0 && (
						<span className={metaClass}>
							{entry.openCount} still live
							{payout && (
								<>
									{" · "}
									<span
										className={css({
											color: "success.default",
											fontWeight: "bold",
										})}
									>
										{payout.win}
									</span>
									{" / "}
									<span
										className={css({
											color: "danger.default",
											fontWeight: "bold",
										})}
									>
										{payout.lose}
									</span>
								</>
							)}
						</span>
					)}
				</VStack>
				{hasResults ? (
					<RecordStat
						value={formatSigned(entry.points, { zeroSign: true })}
						label={entry.openCount > 0 ? "So far" : "Final"}
						tone={entry.points >= 0 ? "success" : "danger"}
					/>
				) : (
					<span className={metaClass}>No results yet</span>
				)}
			</HStack>
		</Link>
	)
}
