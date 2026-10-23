import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// One thing to rank as it's shown: a name, a sublabel and a logo.
export const RankItemFragment = graphql(`
	fragment RankItem_item on RankItem {
		label
		sublabel
		team {
			...Team_team @unmask
		}
	}
`)

// One player's game: the item up next and the five slots, with the answers
// once all five are placed. Spread with @unmask: the game components read it
// as plain props.
export const RankPlayFragment = graphql(`
	fragment RankPlay_play on RankPlay {
		status
		correctCount
		next {
			...RankItem_item @unmask
		}
		slots {
			slot
			correct
			placed {
				...RankItem_item @unmask
			}
			answer {
				display
				item {
					...RankItem_item @unmask
				}
			}
		}
	}
`)

export const RankPuzzleTodayDocument = graphql(`
	query RankPuzzleToday {
		rankPuzzleToday {
			id
			date
			prompt
			context
			nextPuzzleAt
			league {
				id
				abbreviation
			}
			viewerPlay {
				...RankPlay_play @unmask
			}
		}
	}
`)

export const rankPuzzleTodayQuery = gqlQueryOptions(RankPuzzleTodayDocument, {})

// Any scheduled day's puzzle, for an admin's practice game. Admins only.
export const AdminRankPuzzleDocument = graphql(`
	query AdminRankPuzzle($date: String!) {
		adminRankPuzzle(date: $date) {
			__typename
			... on RankPuzzle {
				id
				date
				prompt
				context
				nextPuzzleAt
				league {
					id
					abbreviation
				}
			}
		}
	}
`)

export const adminRankPuzzleQuery = (date: string) =>
	gqlQueryOptions(AdminRankPuzzleDocument, { date })

export const RankPuzzleGuestPlayDocument = graphql(`
	query RankPuzzleGuestPlay($puzzleId: ID!, $placements: [Int!]!) {
		rankPuzzleGuestPlay(puzzleId: $puzzleId, placements: $placements) {
			__typename
			... on RankPlay {
				...RankPlay_play @unmask
			}
		}
	}
`)

// `placements` are 0-based slots, as the browser holds them.
export const rankPuzzleGuestPlayQuery = (
	puzzleId: string,
	placements: number[],
) => gqlQueryOptions(RankPuzzleGuestPlayDocument, { puzzleId, placements })

export const RankPuzzleShareDocument = graphql(`
	query RankPuzzleShare(
		$date: String!
		$result: String!
		$by: String!
		$hasBy: Boolean!
	) {
		rankPuzzleShare(date: $date) {
			date
			prompt
			context
			league {
				id
				abbreviation
			}
			answer {
				display
				item {
					...RankItem_item @unmask
				}
			}
			sharer(username: $by, result: $result) @include(if: $hasBy) {
				id
				username
				name
				avatarUrl
			}
		}
	}
`)

// `by` is the username a shared link names; the API returns them as the
// sharer only if the link's squares are their real result.
export const rankPuzzleShareQuery = (
	date: string,
	result: string,
	by: string | undefined,
) =>
	gqlQueryOptions(RankPuzzleShareDocument, {
		date,
		result,
		by: by ?? "",
		hasBy: !!by,
	})

export const ViewerRankStatsDocument = graphql(`
	query ViewerRankStats {
		viewerRankStats {
			played
			perfect
			distribution
			currentStreak
			bestStreak
		}
	}
`)

export const viewerRankStatsQuery = gqlQueryOptions(ViewerRankStatsDocument, {})

export const GroupRankBoardDocument = graphql(`
	query GroupRankBoard($groupId: ID!) {
		group(id: $groupId) {
			id
			rankBoard {
				date
				today {
					status
					squares
					correctCount
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

export const groupRankBoardQuery = (groupId: string) =>
	gqlQueryOptions(GroupRankBoardDocument, { groupId })

export const RankPuzzleAdminFragment = graphql(`
	fragment RankPuzzleAdmin_puzzle on RankPuzzleAdmin {
		id
		date
		kind
		prompt
		context
		played
		league {
			id
			abbreviation
		}
		order {
			label
			sublabel
			display
		}
	}
`)

export const AdminRankScheduleDocument = graphql(`
	query AdminRankSchedule($days: Int) {
		adminRankSchedule(days: $days) {
			__typename
			... on QueryAdminRankScheduleSuccess {
				data {
					date
					puzzle {
						...RankPuzzleAdmin_puzzle @unmask
					}
				}
			}
		}
	}
`)

export const adminRankScheduleQuery = gqlQueryOptions(
	AdminRankScheduleDocument,
	{ days: 30 },
)
