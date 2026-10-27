import { chainResultHeadline } from "@called-my-shot/schemas"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { PlayerHeadshot } from "#/components/ui/player-headshot"
import { teammateChainTodayQuery } from "#/graphql/teammate-chain/queries"
import { useMe } from "#/hooks/use-me"

// Today's Teammate Chain on the Arcade hub, in the game's color: the two
// players to connect and par, whether the viewer has played it yet, and how
// it went if they have.
export function TeammateChainHubCard() {
	const me = useMe()
	const { data } = useQuery(teammateChainTodayQuery)
	const puzzle = data?.teammateChainToday
	const play = me ? puzzle?.viewerPlay : null
	const over = !!play && play.status !== "PLAYING"

	return (
		<Link
			to="/arcade/teammate-chain"
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "4",
				padding: { base: "5", md: "6" },
				borderRadius: "2xl",
				bg: "chain.default",
				color: "chain.ink",
				transition: "transform 0.15s ease",
				_hover: { transform: "translateY(-2px)" },
			})}
		>
			<div
				className={css({
					display: "flex",
					justifyContent: "space-between",
					gap: "3",
					textStyle: "label",
					fontWeight: "bold",
				})}
			>
				<span>Daily</span>
				{puzzle && (
					<span>
						{seasonDateLabel(puzzle.date)} · {puzzle.league.abbreviation}
					</span>
				)}
			</div>
			<h2
				className={css({
					fontFamily: "heading",
					fontSize: { base: "3xl", md: "4xl" },
					lineHeight: "1",
				})}
			>
				Teammate Chain
			</h2>
			<p className={css({ fontSize: "sm", fontWeight: "medium" })}>
				{puzzle
					? `Today: ${puzzle.start.player.name} to ${puzzle.target.player.name}, par ${puzzle.par}. `
					: ""}
				Connect two players through teammates, in as few links as you can.
			</p>
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "3",
					flexWrap: "wrap",
					marginTop: "auto",
				})}
			>
				{puzzle ? (
					<span
						className={css({
							display: "flex",
							alignItems: "center",
							gap: "2",
							padding: "2",
							borderRadius: "lg",
							bg: "bg.canvas",
							color: "fg.muted",
							fontSize: "xs",
						})}
					>
						<PlayerHeadshot
							name={puzzle.start.player.name}
							src={puzzle.start.player.headshotUrl}
						/>
						<span aria-hidden>···</span>
						<PlayerHeadshot
							name={puzzle.target.player.name}
							src={puzzle.target.player.headshotUrl}
						/>
					</span>
				) : (
					<span />
				)}
				<span className={css({ fontFamily: "heading", fontSize: "lg" })}>
					{!puzzle
						? "No Teammate Chain today"
						: over
							? chainResultHeadline(play?.links ?? null)
							: play
								? "Keep going"
								: "Play"}
				</span>
			</div>
		</Link>
	)
}
