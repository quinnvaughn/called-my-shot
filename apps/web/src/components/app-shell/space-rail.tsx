import { useQuery } from "@tanstack/react-query"
import { FiCompass, FiPlus } from "react-icons/fi"
import { GoHomeFill } from "react-icons/go"
import { IoGameController } from "react-icons/io5"
import { css } from "styled-system/css"
import { NewGroupModal } from "#/components/groups/new-group-modal"
import { GroupLogo } from "#/components/ui/group-logo"
import { myFollowsQuery } from "#/graphql/follows/queries"
import { sidebarGroupsQuery } from "#/graphql/groups/queries"
import { teamSlug } from "#/lib/team-slug"
import { openModal } from "#/stores/modal-store"
import { RailTeamGlyph } from "./rail-team-glyph"
import { RailTile, railGlyph, railGlyphDashed } from "./rail-tile"
import type { Space } from "./space"
import type { League, Me } from "./types"

const divider = css({
	flexShrink: 0,
	width: "6",
	borderTop: "1px solid {colors.border.default}",
	marginBlock: "1",
})

// The column of spaces down the left edge, md up: Home and Arcade, the
// leagues and teams the viewer follows, then their groups. Picking one fills
// the side column beside it with that space's sections. Following a league
// or team is what puts it here; following a person never does. Signed out,
// every league shows. The compass under them opens Spaces, every league to
// follow or follow again, the way the bottom nav's Spaces tab does on phones.
export function SpaceRail({
	me,
	leagues,
	space,
}: {
	me: Me
	leagues: League[]
	space: Space
}) {
	// Loaded by _app for a signed-in viewer, so this has it on first render.
	const { data } = useQuery({ ...sidebarGroupsQuery, enabled: !!me })
	const groups = me ? (data?.myGroups ?? []) : []
	const { data: followsData } = useQuery({ ...myFollowsQuery, enabled: !!me })
	const followedLeagueIds = new Set(
		(followsData?.myFollows.leagues ?? []).map((league) => league.id),
	)
	const shownLeagues = me
		? leagues.filter((league) => followedLeagueIds.has(league.id))
		: leagues
	const shownTeams = me ? (followsData?.myFollows.teams ?? []) : []
	// A team space lights its own tile, or its league's when the team isn't
	// followed.
	const litTeam =
		space.kind === "team"
			? shownTeams.find(
					(team) =>
						team.league.id === space.league.id &&
						teamSlug(team.abbreviation) === space.teamSlug,
				)
			: undefined
	const litLeagueId =
		space.kind === "league" || (space.kind === "team" && !litTeam)
			? space.league.id
			: null
	const followed = shownLeagues.length + shownTeams.length > 0

	return (
		<nav
			aria-label="Spaces"
			className={css({
				display: { base: "none", md: "flex" },
				flexDirection: "column",
				alignItems: "center",
				gap: "2.5",
				width: "16",
				flexShrink: 0,
				// Room for the active tile's ring.
				paddingBlock: "4",
				paddingInline: "3",
				borderRight: "1px solid {colors.border.default}",
				bg: "bg.canvas",
				position: "sticky",
				// Under the top bar (h 16 in top-bar.tsx).
				top: "16",
				height: "calc(100dvh - {spacing.16})",
				overflowY: "auto",
				overscrollBehavior: "contain",
				scrollbarWidth: "none",
				"&::-webkit-scrollbar": { display: "none" },
			})}
		>
			<RailTile
				to="/home"
				label="Home"
				active={space.kind === "home" || space.kind === "you"}
			>
				<span className={railGlyph}>
					<GoHomeFill size={18} />
				</span>
			</RailTile>
			<RailTile to="/arcade" label="Arcade" active={space.kind === "arcade"}>
				<span className={railGlyph}>
					<IoGameController size={16} />
				</span>
			</RailTile>

			{(followed || me) && <span aria-hidden className={divider} />}
			{shownLeagues.map((league) => (
				<RailTile
					key={league.id}
					to={`/leagues/${league.slug}`}
					label={league.name}
					active={litLeagueId === league.id}
				>
					<span className={railGlyph}>{league.abbreviation}</span>
				</RailTile>
			))}
			{shownTeams.map((team) => (
				<RailTile
					key={team.id}
					to={`/leagues/${team.league.slug}/teams/${teamSlug(team.abbreviation)}`}
					label={team.name}
					active={litTeam?.id === team.id}
				>
					<RailTeamGlyph
						abbreviation={team.abbreviation}
						color={team.color}
						logoUrl={team.logoUrl}
					/>
				</RailTile>
			))}
			{me && (
				<RailTile
					to="/spaces"
					label="Find leagues to follow"
					active={space.kind === "spaces"}
				>
					<span className={railGlyphDashed}>
						<FiCompass size={18} />
					</span>
				</RailTile>
			)}

			{me && <span aria-hidden className={divider} />}
			{groups.map((group) => (
				<RailTile
					key={group.id}
					to={`/groups/${group.id}`}
					label={group.name}
					active={space.kind === "group" && space.groupId === group.id}
				>
					<GroupLogo name={group.name} src={group.logoUrl} size="md" />
				</RailTile>
			))}
			{me && (
				<RailTile
					label="New group"
					onClick={() => openModal(<NewGroupModal leagues={leagues} />)}
				>
					<span className={railGlyphDashed}>
						<FiPlus size={18} />
					</span>
				</RailTile>
			)}
		</nav>
	)
}
