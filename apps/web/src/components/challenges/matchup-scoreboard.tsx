import { css, cx } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import type { MatchupOutcome } from "#/graphql/generated/graphql"
import { type ChallengePointsRange, signedPoints } from "#/lib/challenge"

type Result = "won" | "lost" | "draw" | null

type Side = {
	label: string
	points: number
	// What this side still has riding on the questions that haven't settled.
	open?: ChallengePointsRange | null
}

const openValue = css({ fontWeight: "bold" })

function SideTile({ label, points, open, result }: Side & { result: Result }) {
	return (
		<VStack
			gap="2"
			alignItems="flex-start"
			className={css({
				padding: "4",
				borderRadius: "lg",
				border:
					result === "won"
						? "1px solid {colors.success.default}"
						: "1px solid {colors.border.default}",
				backgroundColor: result === "won" ? "success.subtle" : "bg.subtle",
				minWidth: "0",
			})}
		>
			<HStack gap="2" justify="space-between" width="full">
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: "fg.muted",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					})}
				>
					{label}
				</span>
				{result && (
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							fontWeight: "bold",
							letterSpacing: "wide",
							textTransform: "uppercase",
							flexShrink: 0,
							color:
								result === "won"
									? "success.default"
									: result === "lost"
										? "danger.default"
										: "fg.muted",
						})}
					>
						{result === "won" ? "Won" : result === "lost" ? "Lost" : "Draw"}
					</span>
				)}
			</HStack>
			<span
				className={css({
					fontFamily: "heading",
					fontSize: { base: "2xl", md: "3xl" },
					lineHeight: "1",
					color:
						result === "won"
							? "success.default"
							: result === "lost"
								? "fg.muted"
								: "fg.default",
				})}
			>
				{signedPoints(points)} pts
			</span>
			{open && !result && (
				<VStack
					gap="0.5"
					alignItems="flex-start"
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.muted",
					})}
				>
					<span>
						<span className={cx(openValue, css({ color: "success.default" }))}>
							{open.winLow === open.winHigh
								? `+${open.winLow}`
								: `+${open.winLow} to +${open.winHigh}`}
						</span>{" "}
						if every open call hits
					</span>
					<span>
						<span className={cx(openValue, css({ color: "danger.default" }))}>
							−{open.lose}
						</span>{" "}
						if every open call misses
					</span>
				</VStack>
			)}
		</VStack>
	)
}

// Both sides of one 1v1, side by side, with the winner picked out once it's
// settled. `leading` goes on the left: the viewer's side when they're in it.
export function MatchupScoreboard({
	creator,
	acceptor,
	outcome,
	leading,
}: {
	creator: Side
	acceptor: Side
	outcome: MatchupOutcome | null
	leading: "creator" | "acceptor"
}) {
	const resultFor = (side: MatchupOutcome): Result =>
		outcome === null
			? null
			: outcome === "DRAW"
				? "draw"
				: outcome === side
					? "won"
					: "lost"
	const creatorTile = (
		<SideTile
			key="creator"
			label={creator.label}
			points={creator.points}
			open={creator.open}
			result={resultFor("CREATOR")}
		/>
	)
	const acceptorTile = (
		<SideTile
			key="acceptor"
			label={acceptor.label}
			points={acceptor.points}
			open={acceptor.open}
			result={resultFor("ACCEPTOR")}
		/>
	)
	return (
		<Grid columns={2} gap="3">
			{leading === "creator"
				? [creatorTile, acceptorTile]
				: [acceptorTile, creatorTile]}
		</Grid>
	)
}
