import { BsBarChartFill } from "react-icons/bs"
import { FaQuestion } from "react-icons/fa"
import { FaFlag, FaSquareCheck } from "react-icons/fa6"
import {
	FiBookOpen,
	FiCalendar,
	FiClipboard,
	FiGrid,
	FiLifeBuoy,
	FiLink,
	FiMessageSquare,
	FiSettings,
	FiTrendingUp,
	FiUser,
	FiUserPlus,
	FiZap,
} from "react-icons/fi"
import { GoHomeFill } from "react-icons/go"
import { IoGameController } from "react-icons/io5"
import type { IconType } from "react-icons/lib"
import { match } from "ts-pattern"
import { ARCADE_GAMES } from "#/lib/arcade-games"
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
	// under it (Arcade's Today above each game).
	exact?: boolean
	badge?: number
}

export const homeSections: SpaceSection[] = [
	{ label: "Home", icon: GoHomeFill, to: "/home", exact: true },
	{ label: "Leaderboard", icon: BsBarChartFill, to: "/leaderboard" },
]

// The viewer's own lists, in the side column's YOU section under their
// profile and in the More sheet on phones.
export const youPageSections: SpaceSection[] = [
	{ label: "My Calls", icon: FaSquareCheck, to: "/my-calls" },
	{ label: "My Questions", icon: FaQuestion, to: "/my-questions" },
	{ label: "Challenges", icon: FaFlag, to: "/challenges" },
]

// The profile leads, since it's where the bottom nav's You tab lands.
export function youSections(username: string): SpaceSection[] {
	return [
		{ label: "Profile", icon: FiUser, to: `/user/${username}`, exact: true },
		...youPageSections,
	]
}

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

export const arcadeSections: SpaceSection[] = [
	{ label: "Today", icon: FiCalendar, to: "/arcade", exact: true },
	...ARCADE_GAMES.map((game) => ({
		label: game.name,
		icon: game.icon,
		to: `/arcade/${game.slug}`,
	})),
]

// Feed first, then the questions by subject: official and player-written
// questions share each section, and the Official badge tells them apart.
// Teams stays lit on a team's own page, which lives under it.
export function leagueSections(slug: string): SpaceSection[] {
	return [
		{ label: "Feed", icon: FiMessageSquare, to: `/leagues/${slug}/feed` },
		{ label: "Games", icon: FiCalendar, to: `/leagues/${slug}/games` },
		{ label: "Season long", icon: FiTrendingUp, to: `/leagues/${slug}/season` },
		{ label: "Ballots", icon: FiClipboard, to: `/leagues/${slug}/ballots` },
		{ label: "Teams", icon: FiGrid, to: `/leagues/${slug}/teams` },
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
			label: "Posts",
			icon: FiMessageSquare,
			to: `/groups/${groupId}/posts`,
		},
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
		{
			label: "Arcade",
			icon: IoGameController,
			to: `/groups/${groupId}/arcade`,
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
export function spaceTabSections(
	space: Space,
	me: { username: string } | null,
): SpaceSection[] {
	return (
		match(space)
			.with({ kind: "home" }, () => homeSections)
			.with({ kind: "you" }, () => (me ? youSections(me.username) : []))
			.with({ kind: "arcade" }, () => arcadeSections)
			// Leagues and groups draw their own tab row under their header, and
			// a team page links back to its league from its breadcrumb.
			.with(
				{ kind: "league" },
				{ kind: "team" },
				{ kind: "group" },
				{ kind: "spaces" },
				{ kind: "elsewhere" },
				() => [],
			)
			.exhaustive()
	)
}
