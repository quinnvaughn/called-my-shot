import { chainResultHeadline } from "@called-my-shot/schemas"
import { css } from "styled-system/css"
import { ArcadeCountdown } from "#/components/arcade/arcade-countdown"
import { ArcadeShareRow } from "#/components/arcade/arcade-share-row"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { SectionLabel } from "#/components/ui/section-label"
import type {
	TeammateChainPlay_PlayFragment,
	TeammateChainPlayer_PlayerFragment,
} from "#/graphql/generated/graphql"
import { track } from "#/lib/analytics"
import { ChainRarity } from "./chain-rarity"
import { ChainRarityShare } from "./chain-rarity-share"
import { chainShareDare } from "./chain-result"
import { ChainRoute } from "./chain-route"
import { ChainStrip } from "./chain-strip"

// The end of a game, in the game's color: what was done, the chain drawn
// against par with the time beside it, the route with how many
// others went the same way, a par route when theirs wasn't one, and the
// share that dares friends to beat it.
export function ChainReveal({
	date,
	league,
	par,
	start,
	target,
	play,
	nextPuzzleAt,
	resultUrl,
}: {
	date: string
	league: string
	par: number
	start: TeammateChainPlayer_PlayerFragment
	target: TeammateChainPlayer_PlayerFragment
	play: TeammateChainPlay_PlayFragment
	nextPuzzleAt: string | null
	// The full link this result shares, ?by= included.
	resultUrl: string
}) {
	const day = seasonDateLabel(date)
	const solved = play.status === "SOLVED"
	const shares = new Map(
		play.rarity?.players.map((p) => [p.player.player.id, p.share]) ?? [],
	)
	const showPar = !solved || (play.links ?? 0) > par

	return (
		<section
			aria-label="Result"
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: { base: "5", md: "6" },
				padding: { base: "5", md: "8" },
				borderRadius: "2xl",
				bg: "chain.default",
				color: "chain.ink",
			})}
		>
			<div
				className={css({
					display: "flex",
					justifyContent: "space-between",
					gap: "3",
					flexWrap: "wrap",
					textStyle: "label",
					fontWeight: "bold",
				})}
			>
				<span>
					Teammate Chain · {day} · {league}
				</span>
				{nextPuzzleAt && (
					<ArcadeCountdown nextPuzzleAt={nextPuzzleAt} noun="chain" />
				)}
			</div>

			<div
				className={css({ display: "flex", flexDirection: "column", gap: "3" })}
			>
				<span
					className={css({
						fontSize: "sm",
						fontWeight: "medium",
						opacity: 0.85,
					})}
				>
					{start.player.name} to {target.player.name}
				</span>
				<h1
					className={css({
						fontFamily: "heading",
						fontSize: { base: "4xl", md: "6xl" },
						lineHeight: "0.95",
					})}
				>
					{chainResultHeadline(play.links)}
				</h1>
			</div>

			<ChainStrip
				start={start}
				target={target}
				links={play.links}
				par={par}
				seconds={solved ? play.seconds : null}
				hints={play.hints}
				misses={play.misses}
			/>

			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "5",
					padding: { base: "3", md: "4" },
					borderRadius: "xl",
					bg: "bg.canvas",
					color: "fg.default",
				})}
			>
				{solved && (
					<div
						className={css({
							display: "flex",
							flexDirection: "column",
							gap: "2",
						})}
					>
						<SectionLabel>Your route</SectionLabel>
						{play.rarity && (
							<ChainRarity
								solvers={play.rarity.solvers}
								sameRoute={play.rarity.sameRoute}
							/>
						)}
						<ChainRoute
							start={start}
							target={target}
							steps={play.chain}
							connection={play.connection}
							trailing={(playerId) => {
								const share = shares.get(playerId)
								return share === undefined ? null : (
									<ChainRarityShare share={share} />
								)
							}}
						/>
					</div>
				)}
				{showPar && play.parRoute && (
					<div
						className={css({
							display: "flex",
							flexDirection: "column",
							gap: "2",
						})}
					>
						<SectionLabel>A route in {par}</SectionLabel>
						<ChainRoute
							start={start}
							target={target}
							steps={play.parRoute}
							connection={play.parConnection}
						/>
					</div>
				)}
				<ArcadeShareRow
					game="chain"
					dare={chainShareDare({
						links: play.links,
						par,
						rarity: play.rarity ?? null,
					})}
					url={resultUrl}
					title={`Teammate Chain · ${day}`}
					tweetText={
						solved
							? `Connected ${start.player.name} to ${target.player.name} in ${play.links} links on ${day}'s Teammate Chain. Can you find a shorter route?`
							: `Couldn't connect ${start.player.name} to ${target.player.name} on ${day}'s Teammate Chain. Can you?`
					}
					onShared={(method) =>
						track("chain_result_shared", { date, method, toGroup: false })
					}
				/>
			</div>
		</section>
	)
}
