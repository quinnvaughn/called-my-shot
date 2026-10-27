import type { ReactNode } from "react"
import { css } from "styled-system/css"
import type {
	TeammateChainLink_LinkFragment,
	TeammateChainPlayer_PlayerFragment,
	TeammateChainStep_StepFragment,
} from "#/graphql/generated/graphql"
import { ChainGap } from "./chain-gap"
import { ChainLinkRow } from "./chain-link-row"
import { ChainPlayerRow } from "./chain-player-row"

// A chain top to bottom: the start, each player with what he shared with the
// one before, and the target. Connected, the last link runs into the target;
// still open (`par` given), a dashed gap shows how far it's come.
export function ChainRoute({
	start,
	target,
	steps,
	connection,
	par,
	trailing,
}: {
	start: TeammateChainPlayer_PlayerFragment
	target: TeammateChainPlayer_PlayerFragment
	steps: readonly TeammateChainStep_StepFragment[]
	// The last player's link to the target. Empty while the chain is open.
	connection: readonly TeammateChainLink_LinkFragment[]
	// Set while the game is going, for the gap's count against par.
	par?: number
	// What a middle player's row adds at its right, by player id.
	trailing?: (playerId: string) => ReactNode
}) {
	return (
		<ol className={css({ display: "flex", flexDirection: "column" })}>
			<li>
				<ChainPlayerRow player={start} end="start" />
			</li>
			{steps.map((step) => (
				<li key={step.player.player.id}>
					<ChainLinkRow shared={step.shared} />
					<ChainPlayerRow
						player={step.player}
						trailing={trailing?.(step.player.player.id)}
					/>
				</li>
			))}
			<li>
				{connection.length > 0 ? (
					<ChainLinkRow shared={connection} />
				) : par !== undefined ? (
					<ChainGap links={steps.length} par={par} />
				) : null}
				<ChainPlayerRow player={target} end="target" />
			</li>
		</ol>
	)
}
