import { useState } from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { Eyebrow } from "#/components/ui/eyebrow"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { isBaseballRole } from "#/lib/game-starters"
import { KeyLine } from "./key-line"
import { TeamStarters } from "./team-starters"

export const GameStartersFragment = graphql(`
	fragment GameStarters_game on Game {
		id
		awayTeam {
			...Team_team @unmask
		}
		homeTeam {
			...Team_team @unmask
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
			player {
				id
				headshotUrl
			}
		}
	}
`)

type Props = {
	game: FragmentType<typeof GameStartersFragment>
	// Only the one key line per team, with no way to expand to the full lists.
	// For a card that has to hold a fixed height, like the landing page's
	// try-it stack.
	compact?: boolean
	// Collapsed, a phone shows only the Starters heading and its toggle, not
	// the key lines, for a page where the matchup sits above calls to make
	// (a game's page, a question's).
	foldOnMobile?: boolean
}

// Who's starting, as a section of GameMatchupHeader's card rather than a card
// of its own - it's the same object, this game. Collapsed to one key line per
// team so the call form below isn't pushed down, with the full lists a tap
// away. Renders nothing for a game the starters sync hasn't reached.
export function GameStarters({
	compact = false,
	foldOnMobile = false,
	...props
}: Props) {
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
						{open ? (
							"Hide"
						) : foldOnMobile ? (
							<>
								<span className={css({ md: { display: "none" } })}>Show</span>
								<span className={css({ display: { base: "none", md: "inline" } })}>
									Show all
								</span>
							</>
						) : (
							"Show all"
						)}
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
				<VStack
					gap={compact ? "1" : "2"}
					alignItems="stretch"
					className={
						foldOnMobile
							? css({ display: { base: "none", md: "flex" } })
							: undefined
					}
				>
					{teams.map(({ team, starters }) => (
						<KeyLine key={team.id} team={team} starters={starters} />
					))}
				</VStack>
			)}
		</VStack>
	)
}
