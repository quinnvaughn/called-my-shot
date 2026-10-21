import type { IconType } from "react-icons"
import { FaListOl, FaQuestion, FaUserSecret } from "react-icons/fa6"

export type PlayGame = {
	slug: string
	name: string
	description: string
	icon: IconType
}

// The games under Play, in the order the side column and Play's tab row list
// them.
export const PLAY_GAMES: PlayGame[] = [
	{
		slug: "name-that-fan",
		name: "Name That Fan",
		description:
			"Six clues about one fanbase. Every wrong guess reveals another.",
		icon: FaUserSecret,
	},
	{
		slug: "blind-rank",
		name: "Blind Rank",
		description:
			"Five players, one at a time. Place each one before you see the next.",
		icon: FaListOl,
	},
	{
		slug: "whos-your-team",
		name: "Who's Your Team?",
		description: "Answer five questions and we guess which team you root for.",
		icon: FaQuestion,
	},
]

export function playGameBySlug(slug: string) {
	return PLAY_GAMES.find((game) => game.slug === slug) ?? null
}
