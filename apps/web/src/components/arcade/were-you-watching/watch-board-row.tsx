import { css } from "styled-system/css"
import { Identity } from "#/components/ui/identity"
import type { WatchBoardRow_RowFragment } from "#/graphql/generated/graphql"
import { WatchCleanTag } from "./watch-clean-tag"

// One finished run on a quiz's board: place, who, how many right, and the
// time that breaks ties. The viewer's own row is picked out in secondary.
export function WatchBoardRow({
	row,
	total,
	isViewer,
}: {
	row: WatchBoardRow_RowFragment
	total: number
	isViewer: boolean
}) {
	return (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "3",
				padding: "{spacing.3} {spacing.4}",
				"&:not(:last-child)": {
					borderBottom: "1px solid {colors.border.default}",
				},
				"&[data-viewer=true]": { bg: "secondary.subtle" },
			})}
			data-viewer={isViewer}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontWeight: "bold",
					color: "fg.muted",
					width: "6",
					flexShrink: 0,
				})}
			>
				{row.rank}
			</span>
			<div className={css({ flex: "1", minWidth: 0 })}>
				<Identity
					name={row.user.name}
					username={row.user.username}
					avatarUrl={row.user.avatarUrl ?? null}
				/>
			</div>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "flex-end",
					gap: "1",
					flexShrink: 0,
				})}
			>
				<span className={css({ fontFamily: "heading", fontSize: "md" })}>
					{row.correct} of {total} · {row.seconds.toFixed(1)}s
				</span>
				{row.clean && <WatchCleanTag size="sm" />}
			</div>
		</div>
	)
}
