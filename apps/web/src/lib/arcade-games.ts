import type { IconType } from "react-icons"
import { FaCalendarDays, FaLink, FaListOl } from "react-icons/fa6"

export type ArcadeGame = {
	slug: string
	name: string
	description: string
	icon: IconType
}

// The games under Arcade, in the order the side column and Arcade's tab row list
// them.
export const ARCADE_GAMES: ArcadeGame[] = [
	{
		slug: "name-that-season",
		name: "Name That Season",
		description: "One team's season in six clues. Name the team and the year.",
		icon: FaCalendarDays,
	},
	{
		slug: "blind-rank",
		name: "Blind Rank",
		description:
			"Five things, one at a time. Rank each before you see the next.",
		icon: FaListOl,
	},
	{
		slug: "teammate-chain",
		name: "Teammate Chain",
		description:
			"Two players, one chain of teammates between them. Connect them in as few links as you can.",
		icon: FaLink,
	},
]
