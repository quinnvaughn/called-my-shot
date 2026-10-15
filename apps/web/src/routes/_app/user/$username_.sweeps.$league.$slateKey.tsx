import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { CallCard } from "#/components/questions/call-card"
import { SweepRecordCard } from "#/components/streaks/sweep-record-card"
import { SweepShareRow } from "#/components/streaks/sweep-share-row"
import { arrowLink } from "#/components/ui/arrow-link"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import type { UserSweepPageQuery } from "#/graphql/generated/graphql"
import { userSweepPageQuery } from "#/graphql/streaks/queries"
import { useMe } from "#/hooks/use-me"
import { pageMeta } from "#/lib/meta"
import {
	buildSweepTweet,
	formatSlateDates,
	sweepCardVersion,
	sweepPageMeta,
	sweepPath,
} from "#/lib/streak-meta"

type Sweep = NonNullable<
	NonNullable<UserSweepPageQuery["userByUsername"]>["sweep"]
>

// Public, like /calls/:id - this url exists to be pasted somewhere. Not a
// child of /user/$username (that page has no outlet), hence the trailing
// underscore. Left out of the sitemap for the same reason calls are.
export const Route = createFileRoute(
	"/_app/user/$username_/sweeps/$league/$slateKey",
)({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			userSweepPageQuery(params.username, params.league, params.slateKey),
		)
		return { user: data.userByUsername ?? null }
	},
	head: ({ loaderData }) => {
		const user = loaderData?.user
		const sweep = user?.sweep
		if (!user || !sweep) return {}

		const view = describeSweep(sweep)
		const { title, description } = sweepPageMeta({
			username: user.username,
			track: view.track,
			gameCount: sweep.gameCount,
			points: sweep.points,
			dates: view.dates.text,
		})

		return pageMeta({
			title,
			description,
			path: sweepPath(user.username, sweep.league.slug, sweep.slateKey),
			image: {
				// Changes whenever a number on the card does, so an unfurl cache
				// holding an older card is handed a url it has never scraped. The
				// proxy route ignores the param.
				path: `/share/sweeps/${user.username}/${sweep.league.slug}/${sweep.slateKey}/card.png?v=${sweepCardVersion(
					{ gameCount: sweep.gameCount, points: sweep.points },
				)}`,
				alt: title,
			},
		})
	},
})

function describeSweep(sweep: Sweep) {
	return {
		track: `${sweep.league.abbreviation.toUpperCase()} ${sweep.slateLabel}`,
		dates: formatSlateDates(
			sweep.calls.flatMap((call) =>
				call.question.game ? [call.question.game.startsAt] : [],
			),
		),
	}
}

function RouteComponent() {
	const { username, league, slateKey } = Route.useParams()
	const { data } = useSuspenseQuery(
		userSweepPageQuery(username, league, slateKey),
	)
	const me = useMe()
	const user = data.userByUsername
	const sweep = user?.sweep

	if (!user) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Sweep"
				heading="This user doesn't exist"
				subtitle="They may have changed their username, or the link's just wrong."
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	// A sweep is rebuilt whenever a result on its slate changes, so one that
	// existed when this link was shared can be gone now.
	if (!sweep) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Sweep"
				heading="No longer a sweep"
				subtitle={`@${user.username} doesn't have every winner on this slate. A result may have been overturned since this link was shared, or the link's wrong.`}
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	const view = describeSweep(sweep)
	const isOwn = me?.id === user.id

	return (
		<VStack gap="6" alignItems="stretch">
			<Breadcrumb>
				<Breadcrumb.Link
					to="/user/$username"
					params={{ username: user.username }}
				>
					@{user.username}
				</Breadcrumb.Link>
				<Breadcrumb.Current>{view.track} sweep</Breadcrumb.Current>
			</Breadcrumb>

			<PageHeader title={`${view.track} sweep`} subtitle={user.name} />

			<SweepRecordCard
				name={user.name}
				username={user.username}
				avatarUrl={user.avatarUrl}
				gameCount={sweep.gameCount}
				points={sweep.points}
				bonus={sweep.bonus}
				dates={view.dates.text}
				calls={sweep.calls}
				footer={
					<HStack justify="space-between" gap="3" width="full">
						<Link
							to="/user/$username"
							params={{ username: user.username }}
							className={arrowLink({ tone: "primary", align: "parent" })}
						>
							{isOwn ? "Your profile →" : `@${user.username}'s profile →`}
						</Link>
						<SweepShareRow
							layout="icons"
							userId={user.id}
							username={user.username}
							leagueSlug={sweep.league.slug}
							slateKey={sweep.slateKey}
							shareTitle={`@${user.username}'s ${view.track} sweep`}
							tweetText={buildSweepTweet({
								track: view.track,
								gameCount: sweep.gameCount,
								...(isOwn
									? ({ isOwn: true } as const)
									: ({ isOwn: false, username: user.username } as const)),
							})}
						/>
					</HStack>
				}
			/>

			<VStack gap="3" alignItems="stretch">
				<span
					className={css({
						textStyle: "label",
						color: "fg.subtle",
					})}
				>
					Games
				</span>
				<VStack gap="2" alignItems="stretch">
					{sweep.calls.map((call) => (
						<CallCard key={call.id} call={call} />
					))}
				</VStack>
			</VStack>
		</VStack>
	)
}
