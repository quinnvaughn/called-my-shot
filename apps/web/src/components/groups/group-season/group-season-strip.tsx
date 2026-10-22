import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { GuessSquares } from "#/components/play/name-that-season/guess-squares"
import { seasonSquares } from "#/components/play/name-that-season/season-result"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { groupSeasonBoardQuery } from "#/graphql/season-puzzles/queries"
import { useMe } from "#/hooks/use-me"

// Today's Name That Season on the group's Home: who's played, how it went, and
// a way in for the viewer if they haven't. Renders nothing without a board.
export function GroupSeasonStrip({ groupId }: { groupId: string }) {
	const me = useMe()
	const { data } = useQuery(groupSeasonBoardQuery(groupId))
	const board = data?.group?.seasonPuzzleBoard
	if (!board) return null

	const played = board.today.filter((r) => r.status !== "NOT_PLAYED")
	const viewer = board.today.find((r) => r.user.id === me?.id)
	const viewerDone = viewer?.status === "SOLVED" || viewer?.status === "MISSED"

	return (
		<Card>
			<Card.Body>
				<div
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "4",
					})}
				>
					<div
						className={css({
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: "3",
							flexWrap: "wrap",
						})}
					>
						<div
							className={css({
								display: "flex",
								flexDirection: "column",
								gap: "1",
							})}
						>
							<h2
								className={css({
									textStyle: "sectionHeading",
									color: "fg.muted",
								})}
							>
								Today's Name That Season
							</h2>
							<span className={css({ fontSize: "sm", color: "fg.body" })}>
								{played.length === 0
									? "Nobody's played yet."
									: `${played.length} of ${board.today.length} played`}
							</span>
						</div>
						<div className={css({ display: "flex", gap: "2" })}>
							<Link
								to="/groups/$groupId/daily"
								params={{ groupId }}
								className={button({ variant: "outline", size: "sm" })}
							>
								Scoreboard
							</Link>
							{!viewerDone && (
								<Link
									to="/play/name-that-season"
									className={button({ variant: "solid", size: "sm" })}
								>
									Play
								</Link>
							)}
						</div>
					</div>
					{played.length > 0 && (
						<div
							className={css({ display: "flex", flexWrap: "wrap", gap: "4" })}
						>
							{played.map((row) => (
								<div
									key={row.user.id}
									className={css({
										display: "flex",
										flexDirection: "column",
										gap: "1.5",
									})}
								>
									<span
										className={css({ textStyle: "labelSm", color: "fg.muted" })}
									>
										@{row.user.username}
									</span>
									<GuessSquares
										size="sm"
										squares={seasonSquares(row.squares)}
									/>
								</div>
							))}
						</div>
					)}
				</div>
			</Card.Body>
		</Card>
	)
}
