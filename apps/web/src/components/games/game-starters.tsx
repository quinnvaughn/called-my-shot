import { useState } from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { button } from "#/components/ui/button"
import { Eyebrow } from "#/components/ui/eyebrow"
import { Tag } from "#/components/ui/tag"
import { TeamBadge } from "#/components/ui/team-badge"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type {
	GameStarterRole,
	GameStarters_GameFragment,
} from "#/graphql/generated/graphql"

export const GameStartersFragment = graphql(`
	fragment GameStarters_game on Game {
		id
		awayTeam {
			id
			abbreviation
			color
		}
		homeTeam {
			id
			abbreviation
			color
		}
		starters {
			id
			role
			sortOrder
			playerName
			position
			statLine
			injuryStatus
			team {
				id
			}
		}
	}
`)

type Starter = GameStarters_GameFragment["starters"][number]
type Team = GameStarters_GameFragment["homeTeam"]

type Props = {
	game: FragmentType<typeof GameStartersFragment>
	// Only the one key line per team, with no way to expand to the full lists.
	// For a card that has to hold a fixed height, like the landing page's
	// try-it stack.
	compact?: boolean
}

const ROLE_ORDER: GameStarterRole[] = [
	"STARTING_PITCHER",
	"BATTER",
	"OFFENSE",
	"DEFENSE",
	"STARTER",
]

const roleLabel = (role: GameStarterRole) =>
	match(role)
		.with("STARTING_PITCHER", () => "Probable pitcher")
		.with("BATTER", () => "Batting order")
		.with("OFFENSE", () => "Offense")
		.with("DEFENSE", () => "Defense")
		.with("STARTER", () => "Starting five")
		.exhaustive()

const isBaseballRole = (role: GameStarterRole) =>
	role === "STARTING_PITCHER" || role === "BATTER"

// The one line per team the collapsed card shows: the probable pitcher, the
// quarterback, or an NBA team's starting five.
function keyStarters(starters: Starter[]): Starter[] {
	const pitchers = starters.filter((s) => s.role === "STARTING_PITCHER")
	if (pitchers.length > 0) return pitchers
	const quarterbacks = starters.filter(
		(s) => s.role === "OFFENSE" && s.position === "QB",
	)
	if (quarterbacks.length > 0) return quarterbacks
	return starters.filter((s) => s.role === "STARTER")
}

const nameClass = css({
	fontSize: "sm",
	fontWeight: "medium",
	minWidth: "0",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
})

const detailClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	color: "fg.subtle",
	whiteSpace: "nowrap",
})

const emptyClass = css({ fontSize: "sm", color: "fg.subtle" })

function KeyLine({ team, starters }: { team: Team; starters: Starter[] }) {
	const key = keyStarters(starters)

	return (
		<HStack gap="2.5" alignItems="center" minWidth="0">
			<TeamBadge abbreviation={team.abbreviation} color={team.color} />
			{key.length === 0 ? (
				<span className={emptyClass}>Not announced yet</span>
			) : (
				<HStack gap="1.5" alignItems="center" flexWrap="wrap" minWidth="0">
					{key.map((starter, index) => (
						<HStack key={starter.id} gap="1.5" alignItems="center" minWidth="0">
							<span className={nameClass}>
								{starter.playerName}
								{index < key.length - 1 ? "," : ""}
							</span>
							{starter.statLine && (
								<span className={detailClass}>{starter.statLine}</span>
							)}
							{starter.injuryStatus && (
								<Tag size="sm">{starter.injuryStatus}</Tag>
							)}
						</HStack>
					))}
				</HStack>
			)}
		</HStack>
	)
}

function StarterRow({ starter }: { starter: Starter }) {
	const slot =
		starter.role === "BATTER"
			? `${starter.sortOrder} ${starter.position ?? ""}`
			: (starter.position ?? "")

	return (
		<HStack gap="2" alignItems="center" minWidth="0">
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					color: "fg.muted",
					minWidth: "10",
					flexShrink: "0",
				})}
			>
				{slot}
			</span>
			<span className={nameClass}>{starter.playerName}</span>
			{starter.statLine && (
				<span className={detailClass}>{starter.statLine}</span>
			)}
			{starter.injuryStatus && <Tag size="sm">{starter.injuryStatus}</Tag>}
		</HStack>
	)
}

function TeamStarters({
	team,
	starters,
	baseball,
}: {
	team: Team
	starters: Starter[]
	baseball: boolean
}) {
	const groups = ROLE_ORDER.map((role) => ({
		role,
		rows: starters.filter((s) => s.role === role),
	})).filter((group) => group.rows.length > 0)
	const lineupPending = baseball && !starters.some((s) => s.role === "BATTER")

	return (
		<VStack gap="3" alignItems="stretch" minWidth="0">
			<HStack>
				<TeamBadge abbreviation={team.abbreviation} color={team.color} />
			</HStack>
			{groups.map((group) => (
				<VStack key={group.role} gap="1" alignItems="stretch">
					<Eyebrow variant="neutral" size="sm">
						{roleLabel(group.role)}
					</Eyebrow>
					{group.rows.map((starter) => (
						<StarterRow key={starter.id} starter={starter} />
					))}
				</VStack>
			))}
			{lineupPending && (
				<VStack gap="1" alignItems="stretch">
					<Eyebrow variant="neutral" size="sm">
						{roleLabel("BATTER")}
					</Eyebrow>
					<span className={emptyClass}>Not posted yet</span>
				</VStack>
			)}
			{groups.length === 0 && !lineupPending && (
				<span className={emptyClass}>Not announced yet</span>
			)}
		</VStack>
	)
}

// Who's starting, as a section of GameMatchupHeader's card rather than a card
// of its own - it's the same object, this game. Collapsed to one key line per
// team so the call form below isn't pushed down, with the full lists a tap
// away. Renders nothing for a game the starters sync hasn't reached.
export function GameStarters({ compact = false, ...props }: Props) {
	const game = useFragment(GameStartersFragment, props.game)
	const [expanded, setExpanded] = useState(false)
	const open = expanded && !compact

	if (game.starters.length === 0) return null

	const baseball = game.starters.some((s) => isBaseballRole(s.role))
	const teams = [game.awayTeam, game.homeTeam].map((team) => ({
		team,
		starters: game.starters.filter((s) => s.team.id === team.id),
	}))

	return (
		<VStack
			gap={compact ? "1.5" : "3"}
			alignItems="stretch"
			className={css({
				borderTop: "1px solid {colors.border.default}",
				paddingTop: compact ? "2" : "3",
			})}
		>
			<HStack justify="space-between" alignItems="center">
				<Eyebrow variant="neutral" size="sm">
					Starters
				</Eyebrow>
				{!compact && (
					<button
						type="button"
						aria-expanded={open}
						onClick={() => setExpanded((o) => !o)}
						className={button({ variant: "ghost", size: "sm" })}
					>
						{open ? "Hide" : "Show all"}
						{open ? <FiChevronUp /> : <FiChevronDown />}
					</button>
				)}
			</HStack>

			{open ? (
				<>
					<div
						className={css({
							display: "grid",
							gridTemplateColumns: {
								base: "minmax(0, 1fr)",
								sm: "repeat(2, minmax(0, 1fr))",
							},
							gap: { base: "5", sm: "6" },
						})}
					>
						{teams.map(({ team, starters }) => (
							<TeamStarters
								key={team.id}
								team={team}
								starters={starters}
								baseball={baseball}
							/>
						))}
					</div>
					<p className={css({ fontSize: "xs", color: "fg.subtle" })}>
						{baseball
							? "Probable pitchers can change until first pitch. Batting orders appear once teams post them, usually a few hours before the game."
							: "Projected from ESPN depth charts, so the actual starters can differ."}
					</p>
				</>
			) : (
				<VStack gap={compact ? "1" : "2"} alignItems="stretch">
					{teams.map(({ team, starters }) => (
						<KeyLine key={team.id} team={team} starters={starters} />
					))}
				</VStack>
			)}
		</VStack>
	)
}
