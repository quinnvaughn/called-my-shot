import type { IconType } from "react-icons"
import { FaQuestion } from "react-icons/fa"
import { FaFlag, FaMountain } from "react-icons/fa6"

export type CreateKind = {
	key: "rushmore" | "question" | "challenge"
	label: string
	description: string
	icon: IconType
	to: "/rushmore/new" | "/new-question" | "/challenges/new"
}

// What the Create (+) button can make, in the order its sheet lists them.
// Posts lead; questions and challenges sit beside them as peers, so either
// can come out of this list without touching the sheet.
export const CREATE_KINDS: CreateKind[] = [
	{
		key: "rushmore",
		label: "Mount Rushmore",
		description:
			"Pick the four players who define a team or any prompt, with a reason for each.",
		icon: FaMountain,
		to: "/rushmore/new",
	},
	{
		key: "question",
		label: "New question",
		description:
			"Ask something about a game or a season. People make calls on it and it settles on the result.",
		icon: FaQuestion,
		to: "/new-question",
	},
	{
		key: "challenge",
		label: "New challenge",
		description:
			"Make your calls on a few questions and send the link. Whoever scores more points wins the 1v1.",
		icon: FaFlag,
		to: "/challenges/new",
	},
]
