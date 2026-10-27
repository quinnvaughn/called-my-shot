import { chainDurationLabel } from "@called-my-shot/schemas"
import { css } from "styled-system/css"
import { Identity } from "#/components/ui/identity"
import { pluralize } from "#/lib/pluralize"

// One member on the group's Teammate Chain board for the day: who, how many
// links, hints and misses, and the time. Never the players in their chain,
// so the board doesn't hand out a route.
export function GroupChainMemberRow({
	row,
}: {
	row: {
		status: "SOLVED" | "GAVE_UP" | "PLAYING" | "NOT_PLAYED"
		links?: number | null
		hints: number
		misses: number
		seconds?: number | null
		user: {
			id: string
			username: string
			name: string
			avatarUrl?: string | null
		}
	}
}) {
	const extras = [
		row.hints > 0 ? `${row.hints} ${pluralize(row.hints, "hint")}` : null,
		row.misses > 0
			? `${row.misses} ${pluralize(row.misses, "miss", "misses")}`
			: null,
	]
		.filter(Boolean)
		.map((part) => ` · ${part}`)
		.join("")
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
				{row.status === "SOLVED" && (
					<span className={css({ fontFamily: "heading", fontSize: "md" })}>
						{row.links} links
						{row.seconds != null ? ` · ${chainDurationLabel(row.seconds)}` : ""}
					</span>
				)}
				<span className={css({ textStyle: "labelSm", color: "fg.muted" })}>
					{row.status === "SOLVED"
						? `Connected${extras}`
						: row.status === "GAVE_UP"
							? `Gave up${extras}`
							: row.status === "PLAYING"
								? "Still playing"
								: "Not played yet"}
				</span>
			</div>
		</div>
	)
}
