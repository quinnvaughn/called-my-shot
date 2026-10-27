import { css } from "styled-system/css"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { Button } from "#/components/ui/button"
import type { TeammateChainPlayer_PlayerFragment } from "#/graphql/generated/graphql"
import { ChainPlayerRow } from "./chain-player-row"

// Before the clock starts: who to connect, par, and how it works. The pair
// is no secret (it's on the hub and every share), but the clock waits for
// Start.
export function ChainStartPanel({
	date,
	league,
	par,
	start,
	target,
	pending,
	onStart,
}: {
	date: string
	league: string
	par: number
	start: TeammateChainPlayer_PlayerFragment
	target: TeammateChainPlayer_PlayerFragment
	pending: boolean
	onStart: () => void
}) {
	return (
		<section
			aria-label="Today's chain"
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "5",
				padding: { base: "5", md: "8" },
				borderRadius: "2xl",
				bg: "chain.default",
				color: "chain.ink",
			})}
		>
			<span className={css({ textStyle: "label", fontWeight: "bold" })}>
				Teammate Chain · {seasonDateLabel(date)} · {league}
			</span>
			<h1
				className={css({
					fontFamily: "heading",
					fontSize: { base: "3xl", md: "5xl" },
					lineHeight: "1",
				})}
			>
				Connect {start.player.name} to {target.player.name}
			</h1>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "1",
					padding: "2",
					borderRadius: "xl",
					bg: "bg.canvas",
					color: "fg.default",
				})}
			>
				<ChainPlayerRow player={start} end="start" />
				<ChainPlayerRow player={target} end="target" />
			</div>
			<ul
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "2",
					fontSize: "sm",
					fontWeight: "medium",
					listStyle: "disc",
					paddingLeft: "5",
				})}
			>
				<li>
					Name someone who played with {start.player.name} on the same team in
					the same season. Then someone who played with them, and so on, until
					you reach a teammate of {target.player.name}.
				</li>
				<li>
					Par is {par} links, the fewest any route needs. Fewer links wins, and
					your time only breaks ties.
				</li>
				<li>
					A pick who wasn't a teammate counts as a miss but doesn't end the
					game. You can take back the last player you added any time.
				</li>
			</ul>
			<Button
				variant="solid"
				size="lg"
				loading={pending}
				onClick={onStart}
				className={css({ alignSelf: "flex-start" })}
			>
				Start the clock
			</Button>
		</section>
	)
}
