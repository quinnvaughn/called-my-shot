import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { Identity } from "#/components/ui/identity"
import { graphql } from "#/graphql/generated"
import type { RecordBookQuery } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { toIdentity } from "#/lib/identity"
import { pluralize } from "#/lib/pluralize"
import { StreakRecordRows, useStreakEntries } from "./group-highlights"
import { HighlightList, HighlightRow } from "./highlight-row"

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
			}
			streakRecords(limit: 5) {
				...GroupHighlights_streak
			}
		}
	}
`)

export const recordBookQuery = (groupId: string) =>
	gqlQueryOptions(RecordBookDocument, { groupId })

type Book = NonNullable<RecordBookQuery["group"]>["recordBook"]
type Week = Book["weeks"][number]

// Enough to see the last couple of months without scrolling past the
// records.
const WEEKS_SHOWN = 8

const signed = (points: number) =>
	points >= 0 ? `+${points}` : `−${Math.abs(points)}`

function SectionHeading({ children }: { children: string }) {
	return (
		<h2
			className={css({
				fontFamily: "mono",
				fontSize: "xs",
				letterSpacing: "wide",
				color: "fg.muted",
				textTransform: "uppercase",
			})}
		>
			{children}
		</h2>
	)
}

// One week: who won it, or why nobody did. A recapped week links to its
// recap's page.
function WeekRow({ week }: { week: Week }) {
	const players = week.playersOfTheWeek
	const body = (
		<Card size="sm" interactive={week.recapped}>
			<Card.Body>
				<VStack alignItems="stretch" gap="2">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							textTransform: "uppercase",
							color: "fg.muted",
						})}
					>
						{week.weekLabel}
					</span>
					{players.length === 0 ? (
						<span className={css({ fontSize: "sm", color: "fg.muted" })}>
							{week.recapped
								? "No Player of the Week. Nobody with 3 or more settled calls finished up on points."
								: "No recap. Fewer than 2 members had a call settle."}
						</span>
					) : (
						players.map((player, i) => (
							<HStack
								key={player.user?.id ?? `hidden-${i}`}
								justify="space-between"
								alignItems="center"
								gap="3"
							>
								{player.user ? (
									<Identity {...toIdentity(player.user)} />
								) : (
									<span className={css({ fontSize: "sm", color: "fg.muted" })}>
										Not shown on recaps
									</span>
								)}
								<VStack gap="0" alignItems="flex-end" flexShrink="0">
									<span
										className={css({
											fontFamily: "heading",
											fontSize: "xl",
											lineHeight: "1.1",
										})}
									>
										{signed(player.points)}
									</span>
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "2xs",
											color: "fg.muted",
											whiteSpace: "nowrap",
										})}
									>
										{player.wins}–{player.losses}
									</span>
								</VStack>
							</HStack>
						))
					)}
				</VStack>
			</Card.Body>
		</Card>
	)

	if (!week.shareToken) return body
	return (
		<Link
			to="/recaps/$token"
			params={{ token: week.shareToken }}
			className={css({
				display: "block",
				textDecoration: "none",
				color: "inherit",
			})}
		>
			{body}
		</Link>
	)
}

function PlayerOfTheWeekHistory({ weeks }: { weeks: Week[] }) {
	const [showAll, setShowAll] = useState(false)
	const shown = showAll ? weeks : weeks.slice(0, WEEKS_SHOWN)

	return (
		<VStack alignItems="stretch" gap="3">
			<SectionHeading>Player of the Week</SectionHeading>
			{weeks.length === 0 ? (
				<EmptyState>
					The first Player of the Week is named in the group's first weekly
					recap.
				</EmptyState>
			) : (
				<VStack alignItems="stretch" gap="2">
					{shown.map((week) => (
						<WeekRow key={week.weekKey} week={week} />
					))}
					{!showAll && weeks.length > WEEKS_SHOWN && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setShowAll(true)}
						>
							Show all {weeks.length} weeks →
						</Button>
					)}
				</VStack>
			)}
		</VStack>
	)
}

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
			<PlayerOfTheWeekHistory weeks={book.weeks} />

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
									value={signed(s.points)}
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
									value={signed(c.points)}
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
