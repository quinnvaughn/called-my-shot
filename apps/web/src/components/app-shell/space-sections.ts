import { BsBarChartFill } from "react-icons/bs"
import { FaQuestion } from "react-icons/fa"
import { FaFlag, FaSquareCheck } from "react-icons/fa6"
import {
	FiBookOpen,
	FiCalendar,
	FiClipboard,
	FiLifeBuoy,
	FiLink,
	FiSettings,
	FiTrendingUp,
	FiUserPlus,
	FiZap,
} from "react-icons/fi"
import { GoHomeFill } from "react-icons/go"
import type { IconType } from "react-icons/lib"
import { match } from "ts-pattern"
import { PLAY_GAMES } from "#/lib/play-games"
import type { Space } from "./space"

// One place a space can send you. The side column lists these on desktop and
// the tab row above the page lists them on phones, so both read from here.
export type SpaceSection = {
	label: string
	icon: IconType
	to: string
	// Only set when the link is a filtered view of a page another section
	// also links to (the league's own leaderboard), which is also what makes
	// the search count toward the link being lit.
	search?: Record<string, string>
	// Lit on this exact path only, for a section with sections of its own
	// under it (Play's Today above each game).
	exact?: boolean
	badge?: number
}

export const homeSections: SpaceSection[] = [
	{ label: "Home", icon: GoHomeFill, to: "/home", exact: true },
	{ label: "Leaderboard", icon: BsBarChartFill, to: "/leaderboard" },
]

export const youSections: SpaceSection[] = [
	{ label: "My Calls", icon: FaSquareCheck, to: "/my-calls" },
	{ label: "My Questions", icon: FaQuestion, to: "/my-questions" },
	{ label: "Challenges", icon: FaFlag, to: "/challenges" },
]

export function resourceSections(signedIn: boolean): SpaceSection[] {
	return [
		...(signedIn
			? [{ label: "Invite a Friend", icon: FiUserPlus, to: "/invite" }]
			: []),
		{ label: "Updates", icon: FiZap, to: "/updates" },
		...(signedIn
			? [{ label: "Support", icon: FiLifeBuoy, to: "/support" }]
			: []),
	]
}

export const playSections: SpaceSection[] = [
	{ label: "Today", icon: FiCalendar, to: "/play", exact: true },
	...PLAY_GAMES.map((game) => ({
		label: game.name,
		icon: game.icon,
		to: `/play/${game.slug}`,
	})),
]

// By subject, not by who wrote the question: official and player-written
// questions share each section, and the Official badge tells them apart.
export function leagueSections(slug: string): SpaceSection[] {
	return [
		{ label: "Games", icon: FiCalendar, to: `/leagues/${slug}/games` },
		{ label: "Season long", icon: FiTrendingUp, to: `/leagues/${slug}/season` },
		{ label: "Ballots", icon: FiClipboard, to: `/leagues/${slug}/ballots` },
		{
			label: "Leaderboard",
			icon: BsBarChartFill,
			to: "/leaderboard",
			search: { league: slug },
		},
	]
}

export type GroupSpaceShell = {
	activeChainCount: number
	viewerIsMember: boolean
}

export function groupSections(
	groupId: string,
	shell: GroupSpaceShell | null,
): SpaceSection[] {
	return [
		{ label: "Home", icon: GoHomeFill, to: `/groups/${groupId}`, exact: true },
		{
			label: "Leaderboard",
			icon: BsBarChartFill,
			to: `/groups/${groupId}/leaderboard`,
		},
		{
			label: "Chains",
			icon: FiLink,
			to: `/groups/${groupId}/chains`,
			badge: shell?.activeChainCount || undefined,
		},
		{
			label: "Record Book",
			icon: FiBookOpen,
			to: `/groups/${groupId}/record-book`,
		},
		...(shell?.viewerIsMember
			? [
					{
						label: "Settings",
						icon: FiSettings,
						to: `/groups/${groupId}/settings`,
					},
				]
			: []),
	]
}

// The tab row above the page on phones. Home's sections split in two there,
// since Home and You are separate tabs in the bottom nav.
export function spaceTabSections(space: Space): SpaceSection[] {
	return (
		match(space)
			.with({ kind: "home" }, () => homeSections)
			.with({ kind: "you" }, () => youSections)
			.with({ kind: "play" }, () => playSections)
			// Leagues and groups draw their own tab row under their header.
			.with(
				{ kind: "league" },
				{ kind: "group" },
				{ kind: "spaces" },
				{ kind: "elsewhere" },
				() => [],
			)
			.exhaustive()
	)
}
