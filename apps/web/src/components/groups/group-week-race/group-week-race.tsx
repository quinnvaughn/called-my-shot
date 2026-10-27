import { useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { arrowLink } from "#/components/ui/arrow-link"
import { graphql, useFragment } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"
import { formatShortDate } from "#/lib/format-date"
import {
	IN_PLAY_REFETCH_MS,
	isGameInPlay,
	matchupLabel,
} from "#/lib/game-status"
import { toIdentity } from "#/lib/identity"
import { crownLabel } from "#/lib/leaderboard"
import { THIS_WEEK } from "#/lib/leaderboard-filter"
import { raceEndsLabel, raceRowNote, viewerStandingLine } from "#/lib/week-race"
import { WeekRaceRow } from "./week-race-row"

const WeekRaceEntryFragment = graphql(`
	fragment GroupWeekRace_entry on GroupWeekRaceEntry {
		rank
		totalPoints
		settledCallCount
		openCallCount
		user {
			id
			...Identity_user
		}
	}
`)

export const GroupWeekRaceDocument = graphql(`
	query GroupWeekRace($groupId: ID!) {
		group(id: $groupId) {
			id
			weekRace {
				endsAt
				qualifyingCalls
				leaders {
					...GroupWeekRace_entry
				}
				viewer {
					...GroupWeekRace_entry
				}
				viewerNeighbor {
					...GroupWeekRace_entry
				}
				nextGame {
					id
					status
					startsAt
					homeTeam {
						id
						abbreviation
					}
					awayTeam {
						id
						abbreviation
					}
				}
			}
			reigningPlayersOfTheWeek {
				weekLabel
				points
				users {
					id
					...Identity_user
				}
			}
		}
	}
`)

// The longest the race waits for a game to start before reading again, so a
// start time pushed back still gets picked up.
const MAX_WAIT_MS = 30 * 60 * 1000

// Re-read every minute while the next game is on, so points move as calls
// settle; while it's still to come, wait until it starts. Nothing left to
// play means nothing left to move.
export const groupWeekRaceQuery = (groupId: string) =>
	gqlQueryOptions(
		GroupWeekRaceDocument,
		{ groupId },
		{
			refetchInterval: (query) => {
				const game = query.state.data?.group?.weekRace.nextGame
				if (!game) return false
				if (isGameInPlay(game)) return IN_PLAY_REFETCH_MS
				return Math.min(
					Math.max(Date.parse(game.startsAt) - Date.now(), IN_PLAY_REFETCH_MS),
					MAX_WAIT_MS,
				)
			},
		},
	)

type Props = {
	groupId: string
	// The rail shows from xl; the band is its stand-in below that.
	placement: "rail" | "band"
}

// The Player of the Week race so far: the top three, then the viewer if
// they're further down, with how far they are from the member next to them.
// Before anyone has a settled call it shows who won the last one and when
// this week's first results land instead.
export function GroupWeekRace({ groupId, placement }: Props) {
	const { data } = useSuspenseQuery(groupWeekRaceQuery(groupId))
	const race = data.group?.weekRace
	const leaders = useFragment(WeekRaceEntryFragment, race?.leaders ?? [])
	const viewer = useFragment(WeekRaceEntryFragment, race?.viewer ?? null)
	const neighbor = useFragment(
		WeekRaceEntryFragment,
		race?.viewerNeighbor ?? null,
	)
	const group = data.group
	if (!group || !race) return null
	const reigning = group.reigningPlayersOfTheWeek
	const crowned = new Set(reigning?.users.map((u) => u.id))
	const crownFor = (userId: string) =>
		reigning && crowned.has(userId)
			? crownLabel({ playerOfTheWeek: reigning.weekLabel })
			: null

	const viewerId = viewer?.user.id
	const viewerInLeaders = leaders.some((e) => e.user.id === viewerId)
	const standing = viewer
		? viewerStandingLine(
				viewer,
				neighbor && { ...neighbor, name: toIdentity(neighbor.user).name },
				race.qualifyingCalls,
			)
		: null
	const nextGame = race.nextGame

	return (
		<VStack
			alignItems="stretch"
			gap="3"
			display={placement === "band" ? { base: "flex", xl: "none" } : "flex"}
		>
			<HStack justify="space-between" alignItems="baseline" gap="3">
				<h2 className={css({ textStyle: "sectionHeading", color: "fg.muted" })}>
					This week
				</h2>
				<span className={css({ textStyle: "meta", color: "fg.muted" })}>
					{raceEndsLabel(race.endsAt)}
				</span>
			</HStack>

			{leaders.length > 0 ? (
				<VStack alignItems="stretch" gap="0.5">
					{leaders.map((entry) => (
						<WeekRaceRow
							key={entry.user.id}
							rank={entry.rank}
							user={toIdentity(entry.user)}
							points={entry.totalPoints}
							note={raceRowNote(entry, race.qualifyingCalls)}
							crown={crownFor(entry.user.id)}
							isViewer={entry.user.id === viewerId}
						/>
					))}
					{viewer && !viewerInLeaders && (
						<>
							<span
								aria-hidden
								className={css({
									color: "fg.subtle",
									fontSize: "xs",
									paddingInline: "2",
									lineHeight: "1",
								})}
							>
								···
							</span>
							<WeekRaceRow
								rank={viewer.rank}
								user={toIdentity(viewer.user)}
								points={viewer.totalPoints}
								note={raceRowNote(viewer, race.qualifyingCalls)}
								crown={crownFor(viewer.user.id)}
								isViewer
							/>
						</>
					)}
					{standing && (
						<p
							className={css({
								textStyle: "meta",
								color: "fg.muted",
								paddingTop: "1",
							})}
						>
							{standing}
						</p>
					)}
				</VStack>
			) : (
				<VStack alignItems="stretch" gap="2">
					{reigning && (
						<VStack alignItems="stretch" gap="0.5">
							<span className={css({ textStyle: "label", color: "fg.muted" })}>
								Last Player of the Week
							</span>
							{reigning.users.map((user) => (
								<WeekRaceRow
									key={user.id}
									rank={null}
									user={toIdentity(user)}
									points={reigning.points}
									note={reigning.weekLabel}
									crown={crownFor(user.id)}
									isViewer={user.id === viewerId}
								/>
							))}
						</VStack>
					)}
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						{nextGame
							? `First results after ${matchupLabel(nextGame)} · ${formatShortDate(nextGame.startsAt)}`
							: "No calls on this week's games yet."}
					</p>
				</VStack>
			)}

			<Link
				to="/groups/$groupId/leaderboard"
				params={{ groupId }}
				search={{ season: THIS_WEEK }}
				className={arrowLink({ tone: "quiet" })}
			>
				Full board
			</Link>
		</VStack>
	)
}
