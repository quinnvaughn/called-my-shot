import { css } from "styled-system/css"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FormError } from "#/components/ui/form-error"
import type {
	TeammateChainPlay_PlayFragment,
	TeammateChainPlayer_PlayerFragment,
} from "#/graphql/generated/graphql"
import { ChainClock } from "./chain-clock"
import { ChainDeadEnd } from "./chain-dead-end"
import { ChainHintPanel } from "./chain-hint-panel"
import { ChainMissChip } from "./chain-miss-chip"
import { ChainPlayerSearch } from "./chain-player-search"
import { ChainRoute } from "./chain-route"

// The most players a chain holds between its two ends, as the API allows.
export const CHAIN_MAX_MIDDLE = 5

// A game in progress: the clock, the chain so far running down to the
// target, the box for the next pick, a dead-end warning or hints, the
// misses, and taking a player back or giving up.
export function ChainBoard({
	puzzle,
	play,
	pending,
	error,
	onPick,
	onHint,
	onUndo,
	onGiveUp,
}: {
	puzzle: {
		id: string
		date: string
		par: number
		league: { abbreviation: string }
		start: TeammateChainPlayer_PlayerFragment
		target: TeammateChainPlayer_PlayerFragment
	}
	play: TeammateChainPlay_PlayFragment
	pending: boolean
	error: string | null
	onPick: (player: TeammateChainPlayer_PlayerFragment) => void
	onHint: () => void
	onUndo: () => void
	onGiveUp: () => void
}) {
	const last = play.chain.at(-1)?.player ?? puzzle.start
	const misses = play.moves.flatMap((move) =>
		move.kind === "MISS" && move.player ? [move.player.player] : [],
	)

	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "4" })}
		>
			<div
				className={css({
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					gap: "3",
					padding: "{spacing.3} {spacing.4}",
					borderRadius: "xl",
					bg: "chain.default",
					color: "chain.ink",
					textStyle: "label",
					fontWeight: "bold",
				})}
			>
				<span>
					Teammate Chain · {seasonDateLabel(puzzle.date)} ·{" "}
					{puzzle.league.abbreviation} · par {puzzle.par}
				</span>
				{play.startedAt && <ChainClock startedAt={play.startedAt} />}
			</div>

			<Card>
				<div className={css({ padding: { base: "2", md: "3" } })}>
					<ChainRoute
						start={puzzle.start}
						target={puzzle.target}
						steps={play.chain}
						connection={[]}
						par={puzzle.par}
					/>
				</div>
			</Card>

			<ChainPlayerSearch
				puzzleId={puzzle.id}
				lastName={last.player.name}
				excludeIds={[
					puzzle.start.player.id,
					puzzle.target.player.id,
					...play.chain.map((step) => step.player.player.id),
				]}
				full={play.chain.length >= CHAIN_MAX_MIDDLE}
				disabled={pending}
				onPick={onPick}
			/>
			<FormError message={error} />

			{play.deadEnd ? (
				<ChainDeadEnd
					lastName={last.player.name}
					targetName={puzzle.target.player.name}
					disabled={pending}
					onUndo={onUndo}
				/>
			) : (
				<ChainHintPanel
					lastName={last.player.name}
					clues={play.clues}
					cluesLeft={play.cluesLeft}
					hints={play.hints}
					disabled={pending}
					onHint={onHint}
				/>
			)}

			{misses.length > 0 && (
				<div
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "2",
					})}
				>
					<span className={css({ textStyle: "labelSm", color: "fg.muted" })}>
						{misses.length === 1 ? "1 miss" : `${misses.length} misses`}: not a
						teammate of the player they followed
					</span>
					<ul className={css({ display: "flex", flexWrap: "wrap", gap: "2" })}>
						{misses.map((miss, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: the same player can miss twice
							<ChainMissChip key={`${miss.id}:${i}`} name={miss.name} />
						))}
					</ul>
				</div>
			)}

			<div
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "flex-end",
					gap: "3",
					flexWrap: "wrap",
				})}
			>
				<div className={css({ display: "flex", gap: "2" })}>
					<Button
						variant="outline"
						disabled={pending || play.chain.length === 0}
						onClick={onUndo}
					>
						Take back {play.chain.at(-1)?.player.player.name ?? "a player"}
					</Button>
					<Button variant="ghost" disabled={pending} onClick={onGiveUp}>
						Give up
					</Button>
				</div>
			</div>
		</div>
	)
}
