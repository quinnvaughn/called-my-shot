import {
	CHAIN_HOLD_BOOST,
	formatChainMultiplier,
} from "@called-my-shot/scoring"
import type { ChainLink_LinkFragment } from "#/graphql/generated/graphql"
import { pickSummary, toCallSummary } from "#/lib/call-summary"

export type ChainLinkData = ChainLink_LinkFragment

// A link's chance as the chain shows it: "50%", "12%".
export function chanceLabel(chance: number): string {
	return `${Math.round(chance * 100)}%`
}

export const multiplierLabel = formatChainMultiplier

// What a held chain pays over its odds, as a percent: "10".
export const CHAIN_BONUS_PCT = Math.round((CHAIN_HOLD_BOOST - 1) * 100)

// The part of a multiplier the odds alone pay, before the chain's bonus.
export const oddsMultiplierLabel = (mult: number) =>
	formatChainMultiplier(mult / CHAIN_HOLD_BOOST)

// What a link picked, said the way a call card says it: "Over 224.5".
export function linkPick(link: Pick<ChainLinkData, "call">): string | null {
	return link.call ? pickSummary(toCallSummary(link.call)) : null
}

export function linkMatchup(link: Pick<ChainLinkData, "game">): string | null {
	return link.game
		? `${link.game.awayTeam.abbreviation} @ ${link.game.homeTeam.abbreviation}`
		: null
}
