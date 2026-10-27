import { css } from "styled-system/css"
import { WatchCleanTag } from "#/components/arcade/were-you-watching/watch-clean-tag"
import { Identity } from "#/components/ui/identity"

// One member on a Were You Watching? quiz in the group: who, how many they
// got right and how fast.
export function GroupWatchMemberRow({
	row,
	total,
}: {
	row: {
		status: "FINISHED" | "PLAYING" | "NOT_PLAYED"
		correct?: number | null
		seconds?: number | null
		clean: boolean
		user: {
			id: string
			username: string
			name: string
			avatarUrl?: string | null
		}
	}
	total: number
}) {
	return (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: "3",
				padding: "{spacing.3} {spacing.4}",
				"&:not(:last-child)": {
					borderBottom: "1px solid {colors.border.default}",
				},
			})}
		>
			<Identity
				name={row.user.name}
				username={row.user.username}
				avatarUrl={row.user.avatarUrl ?? null}
			/>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "flex-end",
					gap: "1",
					flexShrink: 0,
				})}
			>
				{row.status === "FINISHED" ? (
					<>
						<span className={css({ fontFamily: "heading", fontSize: "md" })}>
							{row.correct} of {total}
							{row.seconds != null ? ` · ${row.seconds.toFixed(1)}s` : ""}
						</span>
						{row.clean && <WatchCleanTag size="sm" />}
					</>
				) : (
					<span className={css({ textStyle: "labelSm", color: "fg.muted" })}>
						{row.status === "PLAYING" ? "Still playing" : "Not played yet"}
					</span>
				)}
			</div>
		</div>
	)
}
