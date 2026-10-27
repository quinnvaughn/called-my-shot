import type { StartGroupSurface } from "#/lib/analytics"
import type { AuthModalSurface } from "#/lib/auth-modal-copy"
import type { ShareCampaign } from "#/lib/share-links"

// The arcade games, and what the parts they share need to know about each:
// where a sign-up or a new group came from, which campaign a share is, and
// where a group keeps its board.
export type ArcadeGameKey = "season" | "rank" | "chain" | "watch"

export type NextStep =
	| "sign_up"
	| "join_group"
	| "start_group"
	| "group_board"
	| "calls"

export const ARCADE_GAME_INFO: Record<
	ArcadeGameKey,
	{
		name: string
		surface: AuthModalSurface & StartGroupSurface
		campaign: ShareCampaign
	}
> = {
	season: {
		name: "Name That Season",
		surface: "season_puzzle",
		campaign: "name_that_season",
	},
	rank: { name: "Blind Rank", surface: "blind_rank", campaign: "blind_rank" },
	chain: {
		name: "Teammate Chain",
		surface: "teammate_chain",
		campaign: "teammate_chain",
	},
	watch: {
		name: "Were You Watching?",
		surface: "were_you_watching",
		campaign: "were_you_watching",
	},
}
