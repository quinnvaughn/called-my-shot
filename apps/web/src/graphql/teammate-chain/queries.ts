import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// A player as the game shows him: photo, name, the years he played in the
// league and every team he played for there.
export const TeammateChainPlayerFragment = graphql(`
	fragment TeammateChainPlayer_player on TeammateChainPlayer {
		firstSeason
		lastSeason
		player {
			id
			name
			headshotUrl
		}
		teams {
			name
			years
			team {
				...Team_team @unmask
			}
		}
	}
`)

// What two neighbors in a chain shared.
export const TeammateChainLinkFragment = graphql(`
	fragment TeammateChainLink_link on TeammateChainLink {
		name
		label
		current
		team {
			...Team_team @unmask
		}
	}
`)

export const TeammateChainStepFragment = graphql(`
	fragment TeammateChainStep_step on TeammateChainStep {
		player {
			...TeammateChainPlayer_player @unmask
		}
		shared {
			...TeammateChainLink_link @unmask
		}
	}
`)

// One player's game. Spread with @unmask: the game components read it as
// plain props.
export const TeammateChainPlayFragment = graphql(`
	fragment TeammateChainPlay_play on TeammateChainPlay {
		status
		startedAt
		seconds
		misses
		hints
		clues
		cluesLeft
		deadEnd
		links
		resultCode
		chain {
			...TeammateChainStep_step @unmask
		}
		connection {
			...TeammateChainLink_link @unmask
		}
		moves {
			kind
			player {
				...TeammateChainPlayer_player @unmask
			}
		}
		parRoute {
			...TeammateChainStep_step @unmask
		}
		parConnection {
			...TeammateChainLink_link @unmask
		}
		rarity {
			solvers
			sameRoute
			players {
				count
				share
				player {
					...TeammateChainPlayer_player @unmask
				}
			}
		}
	}
`)

export const TeammateChainPuzzleFragment = graphql(`
	fragment TeammateChainPuzzle_puzzle on TeammateChainPuzzle {
		id
		date
		par
		nextPuzzleAt
		league {
			id
			name
			abbreviation
		}
		start {
			...TeammateChainPlayer_player @unmask
		}
		target {
			...TeammateChainPlayer_player @unmask
		}
	}
`)

export const TeammateChainTodayDocument = graphql(`
	query TeammateChainToday {
		teammateChainToday {
			...TeammateChainPuzzle_puzzle @unmask
			viewerPlay {
				...TeammateChainPlay_play @unmask
			}
		}
	}
`)

export const teammateChainTodayQuery = gqlQueryOptions(
	TeammateChainTodayDocument,
	{},
)

// Any scheduled day's puzzle, for an admin's practice game. Admins only.
export const AdminTeammateChainPuzzleDocument = graphql(`
	query AdminTeammateChainPuzzle($date: String!) {
		adminTeammateChainPuzzle(date: $date) {
			__typename
			... on TeammateChainPuzzle {
				...TeammateChainPuzzle_puzzle @unmask
			}
		}
	}
`)

export const adminTeammateChainPuzzleQuery = (date: string) =>
	gqlQueryOptions(AdminTeammateChainPuzzleDocument, { date })

export const TeammateChainGuestPlayDocument = graphql(`
	query TeammateChainGuestPlay(
		$puzzleId: ID!
		$inputs: [TeammateChainInput!]!
		$startedAt: DateTime!
		$finishedAt: DateTime
	) {
		teammateChainGuestPlay(
			puzzleId: $puzzleId
			inputs: $inputs
			startedAt: $startedAt
			finishedAt: $finishedAt
		) {
			__typename
			... on TeammateChainPlay {
				...TeammateChainPlay_play @unmask
			}
		}
	}
`)

export type ChainInput =
	| { kind: "PICK"; playerId: string }
	| { kind: "HINT" }
	| { kind: "UNDO" }
	| { kind: "GIVE_UP" }

export const teammateChainGuestPlayQuery = (
	puzzleId: string,
	inputs: ChainInput[],
	startedAt: string,
	finishedAt: string | null,
) =>
	gqlQueryOptions(TeammateChainGuestPlayDocument, {
		puzzleId,
		inputs,
		startedAt,
		finishedAt,
	})

// The league's players by name, for the next pick.
export const TeammateChainPlayersDocument = graphql(`
	query TeammateChainPlayers($puzzleId: ID!, $search: String!) {
		teammateChainPlayers(puzzleId: $puzzleId, search: $search) {
			...TeammateChainPlayer_player @unmask
		}
	}
`)

export const teammateChainPlayersQuery = (puzzleId: string, search: string) =>
	gqlQueryOptions(TeammateChainPlayersDocument, { puzzleId, search })

export const TeammateChainRouteFragment = graphql(`
	fragment TeammateChainRoute_route on TeammateChainRoute {
		steps {
			...TeammateChainStep_step @unmask
		}
		connection {
			...TeammateChainLink_link @unmask
		}
	}
`)

export const TeammateChainShareDocument = graphql(`
	query TeammateChainShare(
		$date: String!
		$result: String!
		$by: String!
		$hasBy: Boolean!
	) {
		teammateChainShare(date: $date) {
			revealed
			puzzle {
				...TeammateChainPuzzle_puzzle @unmask
			}
			parRoute {
				...TeammateChainRoute_route @unmask
			}
			sharer(username: $by, result: $result) @include(if: $hasBy) {
				id
				username
				name
				avatarUrl
			}
			sharerRoute(username: $by, result: $result) @include(if: $hasBy) {
				...TeammateChainRoute_route @unmask
			}
		}
	}
`)

// `by` is the username a shared link names; the API returns them as the
// sharer only if the link's result is their real one.
export const teammateChainShareQuery = (
	date: string,
	result: string,
	by: string | undefined,
) =>
	gqlQueryOptions(TeammateChainShareDocument, {
		date,
		result,
		by: by ?? "",
		hasBy: !!by,
	})

export const ViewerTeammateChainStatsDocument = graphql(`
	query ViewerTeammateChainStats {
		viewerTeammateChainStats {
			played
			solved
			atPar
			averageOverPar
			bestSeconds
			currentStreak
			bestStreak
		}
	}
`)

export const viewerTeammateChainStatsQuery = gqlQueryOptions(
	ViewerTeammateChainStatsDocument,
	{},
)

export const AdminTeammateChainScheduleDocument = graphql(`
	query AdminTeammateChainSchedule($days: Int) {
		adminTeammateChainSchedule(days: $days) {
			__typename
			... on QueryAdminTeammateChainScheduleSuccess {
				data {
					date
					puzzle {
						played
						puzzle {
							...TeammateChainPuzzle_puzzle @unmask
						}
						parRoute {
							...TeammateChainPlayer_player @unmask
						}
					}
				}
			}
		}
	}
`)

export const adminTeammateChainScheduleQuery = gqlQueryOptions(
	AdminTeammateChainScheduleDocument,
	{ days: 30 },
)

export const GroupTeammateChainBoardDocument = graphql(`
	query GroupTeammateChainBoard($groupId: ID!) {
		group(id: $groupId) {
			id
			teammateChainBoard {
				date
				par
				today {
					status
					links
					hints
					misses
					seconds
					user {
						id
						username
						name
						avatarUrl
					}
				}
			}
		}
	}
`)

export const groupTeammateChainBoardQuery = (groupId: string) =>
	gqlQueryOptions(GroupTeammateChainBoardDocument, { groupId })
