import { useQuery } from "@tanstack/react-query"
import { FiPlus } from "react-icons/fi"
import { GoHomeFill } from "react-icons/go"
import { IoGameController } from "react-icons/io5"
import { css } from "styled-system/css"
import { NewGroupModal } from "#/components/groups/new-group-modal"
import { GroupLogo } from "#/components/ui/group-logo"
import { sidebarGroupsQuery } from "#/graphql/groups/queries"
import { openModal } from "#/stores/modal-store"
import { RailTile, railGlyph, railGlyphDashed } from "./rail-tile"
import type { Space } from "./space"
import type { League, Me } from "./types"

const divider = css({
	flexShrink: 0,
	width: "6",
	borderTop: "1px solid {colors.border.default}",
	marginBlock: "1",
})

// The column of spaces down the left edge, md up: Home and Play, every
// league, then the viewer's groups. Picking one fills the side column beside
// it with that space's sections.
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
			<RailTile to="/play" label="Play" active={space.kind === "play"}>
				<span className={railGlyph}>
					<IoGameController size={16} />
				</span>
			</RailTile>

			{leagues.length > 0 && <span aria-hidden className={divider} />}
			{leagues.map((league) => (
				<RailTile
					key={league.id}
					to={`/leagues/${league.slug}`}
					label={league.name}
					active={space.kind === "league" && space.league.id === league.id}
				>
					<span className={railGlyph}>{league.abbreviation}</span>
				</RailTile>
			))}

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
