import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { FiUserX } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { LeagueAccordion } from "#/components/profile/league-accordion"
import { ProfileHeader } from "#/components/profile/profile-header"
import { ShareCardPreview } from "#/components/profile/share-card-preview"
import { ShareImagePanel } from "#/components/profile/share-image-panel"
import { StatGrid, statGridItems } from "#/components/profile/stat-grid"
import { CallCard } from "#/components/questions/call-card"
import { EmptyState } from "#/components/ui/empty-state"
import { NotFound } from "#/components/ui/not-found"
import { UserProfileDocument } from "#/graphql/generated/graphql"

export const Route = createFileRoute("/_app/user/$username")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		const { data } = await context.apolloClient.query({
			query: UserProfileDocument,
			variables: { username: params.username },
		})
		return { user: data?.userByUsername ?? null }
	},
})

function sectionLabel(text: string) {
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
			{text}
		</h2>
	)
}

function RouteComponent() {
	const { user } = Route.useLoaderData()
	const { me } = useRouteContext({ from: "__root__" })

	if (!user) {
		return (
			<NotFound
				icon={<FiUserX size="24" />}
				eyebrowText="Profile"
				heading="This user doesn't exist"
				subtitle="They may have changed their username, or the link's just wrong. Double check the URL."
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	return (
		<VStack alignItems="stretch" gap="6">
			<ProfileHeader user={user} viewerId={me?.id} />
			{sectionLabel("Career")}
			<StatGrid
				items={statGridItems({
					rank: user.careerStats?.rank ?? 0,
					totalPoints: user.careerStats?.totalPoints ?? 0,
					accuracy: user.careerStats?.accuracy ?? null,
					callCount: user.careerStats?.callCount ?? 0,
				})}
			/>
			{user.careerStats && (
				<ShareImagePanel
					src={`/share/users/${user.username}`}
					filename={`${user.username}-career-stats.png`}
					label="Share my career stats"
					shareType="profile"
					renderPreview={(previewProps) => (
						<ShareCardPreview
							{...previewProps}
							data={{
								name: user.name,
								username: user.username,
								memberSince: user.createdAt,
								scopeTag: "All-time track record",
								rank: user.careerStats?.rank ?? 0,
								totalPoints: user.careerStats?.totalPoints ?? 0,
								accuracy: user.careerStats?.accuracy ?? null,
								callCount: user.careerStats?.callCount ?? 0,
							}}
						/>
					)}
				/>
			)}
			{user.leagues.length > 0 && (
				<VStack alignItems="stretch" gap="3">
					{sectionLabel("Leagues")}
					<VStack alignItems="stretch" gap="3">
						{user.leagues.map((leagueStats) => (
							<LeagueAccordion
								key={leagueStats.league.id}
								stats={leagueStats}
								user={user}
							/>
						))}
					</VStack>
				</VStack>
			)}
			<VStack alignItems="stretch" gap="3">
				{sectionLabel("Recent Calls")}
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
