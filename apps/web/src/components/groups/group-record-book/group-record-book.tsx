import { Grid, VStack } from "styled-system/jsx"
import { useStreakEntries } from "#/components/groups/group-highlight-entries"
import { HighlightList } from "#/components/groups/highlight-list"
import { HighlightRow } from "#/components/groups/highlight-row"
import { StreakRecordRows } from "#/components/groups/streak-record-rows"
import { EmptyState } from "#/components/ui/empty-state"
import { graphql } from "#/graphql/generated"
import type { RecordBookQuery } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { formatSigned } from "#/lib/format-number"
import { toIdentity } from "#/lib/identity"
import { pluralize } from "#/lib/pluralize"
import { PlayerOfTheWeekHistory } from "./player-of-the-week-history"
import { SectionHeading } from "./section-heading"

export const RecordBookDocument = graphql(`
	query RecordBook($groupId: ID!) {
		group(id: $groupId) {
			id
			recordBook {
				weeks {
					weekKey
					weekLabel
					recapped
					shareToken
					playersOfTheWeek {
						points
						wins
						losses
						user {
							id
							...Identity_user
						}
					}
				}
				mostPointsInAWeek {
					points
					weekKey
					weekLabel
					user {
						id
						...Identity_user
					}
				}
				mostPointsOnACall {
					points
					callId
					headline
					leagueAbbr
					user {
						...Identity_user
					}
				}
				mostPlayerOfTheWeekAwards {
					count
					user {
						id
						...Identity_user
					}
				}
				mostConsecutivePlayerOfTheWeekAwards {
					length
					spanLabel
					user {
						id
						...Identity_user
					}
				}
				mostSweeps {
					count
					user {
						id
						...Identity_user
					}
				}
				mostPerfectCards {
					count
					user {
						id
						...Identity_user
					}
				}
			}
			streakRecords(limit: 5) {
				...GroupHighlights_streak
			}
		}
	}
`)

export const recordBookQuery = (groupId: string) =>
	gqlQueryOptions(RecordBookDocument, { groupId })

type Props = {
	data: NonNullable<RecordBookQuery["group"]>
}

// The group's Player of the Week by week, then its records, sorted the way a
// sports record book is: single week, single call, career, streaks. Each
// record lists its top few, so a holder can see who's closest.
export function GroupRecordBook({ data }: Props) {
	const book = data.recordBook
	const streakRecords = useStreakEntries(data.streakRecords)

	return (
		<VStack alignItems="stretch" gap="8">
			<PlayerOfTheWeekHistory groupId={data.id} weeks={book.weeks} />

			<VStack alignItems="stretch" gap="3">
				<SectionHeading>Single week</SectionHeading>
				<HighlightList label="Most points in a week">
					{book.mostPointsInAWeek.length > 0 ? (
						<VStack alignItems="stretch" gap="2">
							{book.mostPointsInAWeek.map((s) => (
								<HighlightRow
									key={`${s.user.id}-${s.weekKey}`}
									user={toIdentity(s.user)}
									label={s.weekLabel}
									value={formatSigned(s.points, { zeroSign: true })}
									valueLabel="points"
								/>
							))}
						</VStack>
					) : (
						<EmptyState>No Player of the Week yet.</EmptyState>
					)}
				</HighlightList>
			</VStack>

			<VStack alignItems="stretch" gap="3">
				<SectionHeading>Single call</SectionHeading>
				<HighlightList label="Most points on a call">
					{book.mostPointsOnACall.length > 0 ? (
						<VStack alignItems="stretch" gap="2">
							{book.mostPointsOnACall.map((c) => (
								<HighlightRow
									key={c.callId}
									user={toIdentity(c.user)}
									leagueAbbr={c.leagueAbbr}
									label={c.headline}
									value={formatSigned(c.points, { zeroSign: true })}
									valueLabel="points"
									to={{ kind: "call", callId: c.callId }}
								/>
							))}
						</VStack>
					) : (
						<EmptyState>No weekly recaps yet.</EmptyState>
					)}
				</HighlightList>
			</VStack>

			<VStack alignItems="stretch" gap="3">
				<SectionHeading>Career</SectionHeading>
				<Grid columns={{ base: 1, md: 2 }} gap="5">
					<HighlightList label="Most Player of the Week awards">
						{book.mostPlayerOfTheWeekAwards.length > 0 ? (
							<VStack alignItems="stretch" gap="2">
								{book.mostPlayerOfTheWeekAwards.map((c) => (
									<HighlightRow
										key={c.user.id}
										user={toIdentity(c.user)}
										label="Player of the Week"
										value={String(c.count)}
										valueLabel={pluralize(c.count, "award")}
									/>
								))}
							</VStack>
						) : (
							<EmptyState>No Player of the Week yet.</EmptyState>
						)}
					</HighlightList>
					<HighlightList label="Most sweeps">
						{book.mostSweeps.length > 0 ? (
							<VStack alignItems="stretch" gap="2">
								{book.mostSweeps.map((c) => (
									<HighlightRow
										key={c.user.id}
										user={toIdentity(c.user)}
										label="Every winner on a slate"
										value={String(c.count)}
										valueLabel={pluralize(c.count, "sweep")}
									/>
								))}
							</VStack>
						) : (
							<EmptyState>No sweeps yet.</EmptyState>
						)}
					</HighlightList>
					<HighlightList label="Most perfect cards">
						{book.mostPerfectCards.length > 0 ? (
							<VStack alignItems="stretch" gap="2">
								{book.mostPerfectCards.map((c) => (
									<HighlightRow
										key={c.user.id}
										user={toIdentity(c.user)}
										label="Every official question on a game"
										value={String(c.count)}
										valueLabel={pluralize(c.count, "perfect card")}
									/>
								))}
							</VStack>
						) : (
							<EmptyState>No perfect cards yet.</EmptyState>
						)}
					</HighlightList>
				</Grid>
			</VStack>

			<VStack alignItems="stretch" gap="3">
				<SectionHeading>Streaks</SectionHeading>
				<Grid columns={{ base: 1, md: 2 }} gap="5">
					<HighlightList label="Longest hot streak">
						{streakRecords.length > 0 ? (
							<StreakRecordRows entries={streakRecords} />
						) : (
							<EmptyState>Nobody's put a run together yet.</EmptyState>
						)}
					</HighlightList>
					<HighlightList label="Most consecutive Player of the Week awards">
						{book.mostConsecutivePlayerOfTheWeekAwards.length > 0 ? (
							<VStack alignItems="stretch" gap="2">
								{book.mostConsecutivePlayerOfTheWeekAwards.map((r) => (
									<HighlightRow
										key={r.user.id}
										user={toIdentity(r.user)}
										label={r.spanLabel}
										value={String(r.length)}
										valueLabel="in a row"
									/>
								))}
							</VStack>
						) : (
							<EmptyState>Nobody has won two weeks in a row yet.</EmptyState>
						)}
					</HighlightList>
				</Grid>
			</VStack>
		</VStack>
	)
}
