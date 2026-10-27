import { css } from "styled-system/css"
import { TeamBadge } from "#/components/ui/team-badge"
import type { TeammateChainLink_LinkFragment } from "#/graphql/generated/graphql"

// The connector between two players in a chain: the team they shared, what
// it was called then, and when ("Seattle SuperSonics, 2003-04"). A pair who
// played together on more than one team lists the most recent first.
export function ChainLinkRow({
	shared,
}: {
	shared: readonly TeammateChainLink_LinkFragment[]
}) {
	return (
		<div
			className={css({
				display: "flex",
				gap: "3",
				paddingInline: "3",
			})}
		>
			<span
				aria-hidden
				className={css({
					width: "10",
					display: "flex",
					justifyContent: "center",
					flexShrink: 0,
				})}
			>
				<span
					className={css({
						width: "2px",
						bg: "chain.default",
						borderRadius: "full",
					})}
				/>
			</span>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "1",
					paddingBlock: "1.5",
					minWidth: 0,
				})}
			>
				{shared.map((link) => (
					<span
						key={`${link.team.id}:${link.label}`}
						className={css({
							display: "flex",
							alignItems: "center",
							gap: "2",
							fontSize: "xs",
							color: "fg.muted",
						})}
					>
						<TeamBadge
							abbreviation={link.team.abbreviation}
							color={link.team.color}
							logoUrl={link.team.logoUrl}
						/>
						<span className={css({ truncate: true })}>
							{link.name}, {link.label}
						</span>
					</span>
				))}
			</div>
		</div>
	)
}
