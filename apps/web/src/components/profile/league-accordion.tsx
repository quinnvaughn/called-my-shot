import { useState } from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { BreakdownBar } from "#/components/profile/breakdown-bar"
import { ShareCardPreview } from "#/components/profile/share-card-preview"
import { ShareImagePanel } from "#/components/profile/share-image-panel"
import { StatGrid, statGridItems } from "#/components/profile/stat-grid"
import { questionShapeLabel } from "#/lib/question-labels"

type LeagueStats = {
	league: { id: string; name: string; abbreviation: string }
	totalPoints: number
	rank: number
	accuracy: number | null
	callCount: number
	shapeBreakdown: Array<{
		shape: string
		accuracy: number | null
		callCount: number
	}>
}

type User = { name: string; username: string; createdAt: string }

type Props = { stats: LeagueStats; user: User }

export function LeagueAccordion({ stats, user }: Props) {
	const [open, setOpen] = useState(false)

	return (
		<VStack alignItems="stretch" gap="0">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className={css({
					width: "full",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					background: "card",
					border: "1px solid {colors.border.default}",
					borderRadius: open ? "{radii.lg} {radii.lg} 0 0" : "lg",
					padding: "4",
					textAlign: "left",
					cursor: "pointer",
					_hover: { borderColor: "border.emphasized" },
				})}
			>
				<VStack gap="0.5" alignItems="flex-start">
					<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
						{stats.league.name}
					</span>
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							color: "fg.subtle",
						})}
					>
						{stats.accuracy !== null ? `${Math.round(stats.accuracy)}%` : "-"} ·{" "}
						{stats.callCount} calls
					</span>
				</VStack>
				{open ? <FiChevronUp /> : <FiChevronDown />}
			</button>
			{open && (
				<VStack
					alignItems="stretch"
					gap="4"
					className={css({
						background: "card",
						border: "1px solid {colors.border.default}",
						borderTop: "none",
						borderRadius: "0 0 {radii.lg} {radii.lg}",
						padding: "4",
					})}
				>
					<StatGrid items={statGridItems(stats)} />
					<ShareImagePanel
						src={`/share/leagues/${stats.league.id}/users/${user.username}`}
						filename={`${user.username}-${stats.league.abbreviation.toLowerCase()}-stats.png`}
						label={`Share my ${stats.league.abbreviation} stats`}
						renderPreview={(previewProps) => (
							<ShareCardPreview
								{...previewProps}
								data={{
									name: user.name,
									username: user.username,
									memberSince: user.createdAt,
									scopeTag: `${stats.league.abbreviation} track record`,
									rank: stats.rank,
									totalPoints: stats.totalPoints,
									accuracy: stats.accuracy,
									callCount: stats.callCount,
								}}
							/>
						)}
					/>
					{stats.shapeBreakdown.length > 0 && (
						<VStack alignItems="stretch" gap="2">
							{stats.shapeBreakdown.map((s) => (
								<BreakdownBar
									key={s.shape}
									label={
										questionShapeLabel[
											s.shape as keyof typeof questionShapeLabel
										] ?? s.shape
									}
									accuracy={s.accuracy}
									callCount={s.callCount}
								/>
							))}
						</VStack>
					)}
				</VStack>
			)}
		</VStack>
	)
}
