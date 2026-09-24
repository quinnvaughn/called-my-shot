import { useState } from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { BreakdownBar } from "#/components/profile/breakdown-bar"
import {
	type ColdStreakRow,
	ColdStreaksSection,
} from "#/components/profile/cold-streaks-section"
import { ShareCardPreview } from "#/components/profile/share-card-preview"
import { ShareImagePanel } from "#/components/profile/share-image-panel"
import { StatGrid, statGridItems } from "#/components/profile/stat-grid"
import {
	type StreakRow,
	StreaksSection,
} from "#/components/profile/streaks-section"
import {
	type SweepRow,
	SweepsSection,
} from "#/components/profile/sweeps-section"
import { questionShapeLabel } from "#/lib/question-labels"

type LeagueStats = {
	league: { id: string; name: string; abbreviation: string; slug: string }
	totalPoints: number
	rank: number | null
	accuracy: number | null
	convictionEdge: number | null
	resolvedCallCount: number
	shapeBreakdown: Array<{
		shape: string
		accuracy: number | null
		convictionEdge: number | null
		resolvedCallCount: number
	}>
}

type User = {
	name: string
	username: string
	avatarUrl: string | null
	createdAt: string
}

type Props = {
	stats: LeagueStats
	user: User
	// This league's tracks and sweeps, in the order User.streaks,
	// User.coldStreaks and User.sweeps return them.
	streaks: StreakRow[]
	coldStreaks: ColdStreakRow[]
	sweeps: SweepRow[]
	isOwn: boolean
}

const subLabel = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "fg.muted",
})

export function LeagueAccordion({
	stats,
	user,
	streaks,
	coldStreaks,
	sweeps,
	isOwn,
}: Props) {
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
						{stats.resolvedCallCount} resolved
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
						src={`/share/leagues/${stats.league.slug}/users/${user.username}`}
						filename={`${user.username}-${stats.league.abbreviation.toLowerCase()}-stats.png`}
						label={`Share my ${stats.league.abbreviation} stats`}
						shareType="league"
						renderPreview={(previewProps) => (
							<ShareCardPreview
								{...previewProps}
								data={{
									name: user.name,
									username: user.username,
									avatarUrl: user.avatarUrl,
									memberSince: user.createdAt,
									scopeTag: `${stats.league.abbreviation} track record`,
									rank: stats.rank,
									totalPoints: stats.totalPoints,
									accuracy: stats.accuracy,
									resolvedCallCount: stats.resolvedCallCount,
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
									convictionEdge={s.convictionEdge}
									resolvedCallCount={s.resolvedCallCount}
								/>
							))}
						</VStack>
					)}
					{streaks.length > 0 && (
						<VStack alignItems="stretch" gap="2">
							<span className={subLabel}>Hot streaks</span>
							<StreaksSection
								username={user.username}
								streaks={streaks}
								isOwn={isOwn}
								showLeague={false}
							/>
						</VStack>
					)}
					{coldStreaks.length > 0 && (
						<VStack alignItems="stretch" gap="2">
							<span className={subLabel}>Cold streaks</span>
							<ColdStreaksSection
								username={user.username}
								coldStreaks={coldStreaks}
								showLeague={false}
							/>
						</VStack>
					)}
					{sweeps.length > 0 && (
						<VStack alignItems="stretch" gap="2">
							<span className={subLabel}>Sweeps</span>
							<SweepsSection
								username={user.username}
								sweeps={sweeps}
								showLeague={false}
							/>
						</VStack>
					)}
				</VStack>
			)}
		</VStack>
	)
}
