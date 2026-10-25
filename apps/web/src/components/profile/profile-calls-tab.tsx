import { useSuspenseQuery } from "@tanstack/react-query"
import { VStack } from "styled-system/jsx"
import { CallCard } from "#/components/questions/call-card"
import { EmptyState } from "#/components/ui/empty-state"
import { SectionLabel } from "#/components/ui/section-label"
import type { UserProfileQuery } from "#/graphql/generated/graphql"
import { userRecordQuery } from "#/graphql/user/profile/queries"
import { scopedLeague } from "#/lib/profile"
import { statGridItems } from "#/lib/stat-grid"
import { ColdStreaksSection } from "./cold-streaks-section"
import { PointsBreakdownSection } from "./points-breakdown-section"
import { PressersSection } from "./pressers-section"
import { ProfileLeagueRooms } from "./profile-league-rooms"
import { ProfileLeagueTabs } from "./profile-league-tabs"
import { ResultsSection } from "./results-section"
import { StatGrid } from "./stat-grid"
import { StreaksSection } from "./streaks-section"
import { SweepsSection } from "./sweeps-section"

const MAX_LIVE_STREAKS = 3

type Props = {
	user: NonNullable<UserProfileQuery["userByUsername"]>
	// ?league=nba scopes the stats, calendar, breakdown and streaks to one
	// league.
	leagueSlug: string | undefined
	isOwn: boolean
}

// A profile's record: career numbers, results, streaks, pressers and recent
// calls. On your own, the league cards Home used to lead with sit on top.
export function ProfileCallsTab({ user, leagueSlug, isOwn }: Props) {
	const scoped = scopedLeague(user.leagues, leagueSlug)
	const { data: recordData } = useSuspenseQuery(
		userRecordQuery(user.username, scoped?.league.slug ?? null),
	)
	const record = recordData.userByUsername?.record ?? null
	const wideRecord = recordData.userByUsername?.wideRecord ?? null

	const leagueId = scoped?.league.id ?? null
	const inScope = <T extends { league: { id: string } }>(rows: T[]) =>
		leagueId ? rows.filter((row) => row.league.id === leagueId) : rows

	// Only runs still going make the top of the profile.
	const liveStreaks = inScope(user.streaks)
		.filter((streak) => streak.currentLength > 0)
		.slice(0, MAX_LIVE_STREAKS)
	const coldStreaks = inScope(user.coldStreaks)
	const latestSweep = inScope(user.sweeps)[0]
	const stats = scoped ?? user.careerStats

	return (
		<VStack alignItems="stretch" gap="6">
			{isOwn && <ProfileLeagueRooms />}
			<ProfileLeagueTabs username={user.username} leagues={user.leagues} />
			<StatGrid
				header={
					<SectionLabel>
						{scoped ? `${scoped.league.name} career` : "Career"}
					</SectionLabel>
				}
				items={statGridItems({
					rank: stats?.rank ?? null,
					totalPoints: stats?.totalPoints ?? 0,
					accuracy: stats?.accuracy ?? null,
					convictionEdge: stats?.convictionEdge ?? null,
					resolvedCallCount: stats?.resolvedCallCount ?? 0,
				})}
			/>
			{record && (
				<ResultsSection
					record={record}
					wideRecord={wideRecord}
					username={user.username}
					leagueId={leagueId}
					leagueSlug={scoped?.league.slug ?? null}
				/>
			)}
			{record && (
				<PointsBreakdownSection record={record} username={user.username} />
			)}
			{liveStreaks.length > 0 && (
				<VStack alignItems="stretch" gap="3">
					<SectionLabel>Hot streaks</SectionLabel>
					<StreaksSection
						username={user.username}
						streaks={liveStreaks}
						isOwn={isOwn}
						showLeague={!scoped}
						layout="grid"
					/>
				</VStack>
			)}
			{coldStreaks.length > 0 && (
				<VStack alignItems="stretch" gap="3">
					<SectionLabel>Cold streaks</SectionLabel>
					<ColdStreaksSection
						username={user.username}
						coldStreaks={coldStreaks}
						showLeague={!scoped}
					/>
				</VStack>
			)}
			{latestSweep && (
				<VStack alignItems="stretch" gap="3">
					<SectionLabel>Latest sweep</SectionLabel>
					<SweepsSection
						username={user.username}
						sweeps={[latestSweep]}
						showLeague={!scoped}
					/>
				</VStack>
			)}
			<PressersSection
				heading={<SectionLabel>Pressers</SectionLabel>}
				username={user.username}
				pressers={user.pressers}
				leagueId={leagueId}
			/>
			<VStack alignItems="stretch" gap="3">
				<SectionLabel>Recent Calls</SectionLabel>
				{user.recentCalls.length > 0 ? (
					<VStack alignItems="stretch" gap="2">
						{user.recentCalls.map((call) => (
							<CallCard key={call.id} call={call} />
						))}
					</VStack>
				) : (
					<EmptyState>No calls yet.</EmptyState>
				)}
			</VStack>
		</VStack>
	)
}
