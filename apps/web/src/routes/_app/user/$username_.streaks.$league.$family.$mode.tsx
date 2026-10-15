import { createFileRoute } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { StreakPage } from "#/components/streaks/streak-page"
import { NotFound } from "#/components/ui/not-found"
import { userStreakPageQuery } from "#/graphql/streaks/queries"
import { pageMeta } from "#/lib/meta"
import {
	coldCardVersion,
	coldStreakPageMeta,
	parseStreakFamilyParam,
	parseStreakMode,
	streakCardVersion,
	streakFamilyParam,
	streakPageMeta,
	streakPath,
} from "#/lib/streak-meta"
import { describeStreak } from "#/lib/streak-view"

// Public, like /calls/:id - this url exists to be pasted somewhere. Not a
// child of /user/$username (that page has no outlet), hence the trailing
// underscore. Left out of the sitemap for the same reason calls are.
//
// /hot and /cold are separate pages rather than one page that reads whichever
// side is live, because a single track can be worth linking to on both: a
// group's "best streaks" row and its "cold streaks" row can name the same
// track, since a best run of 6 says nothing about missing the last 4.
// Clicking the first should never land on the second. resolveStreakMode in
// the scoring package settles which side a request gets, and the card route
// reads the same segment so an unfurl can't disagree with the page.
export const Route = createFileRoute(
	"/_app/user/$username_/streaks/$league/$family/$mode",
)({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context, params }) => {
		const family = parseStreakFamilyParam(params.family)
		if (!family) return { user: null }
		const data = await context.queryClient.query(
			userStreakPageQuery(params.username, params.league, family),
		)
		return { user: data.userByUsername ?? null }
	},
	head: ({ loaderData, params }) => {
		const user = loaderData?.user
		const streak = user?.streak
		if (!user || !streak) return {}
		const view = describeStreak(streak, parseStreakMode(params.mode))
		if (!view) return {}

		const { title, description } =
			view.mode === "cold"
				? coldStreakPageMeta({
						username: user.username,
						track: view.track,
						currentColdLength: streak.currentColdLength,
						worstColdLength: streak.worstColdLength,
						startedAt: view.runStartedAt,
					})
				: streakPageMeta({
						username: user.username,
						track: view.track,
						currentLength: streak.currentLength,
						bestLength: streak.bestLength,
						runStartedAt: view.runStartedAt,
					})

		return pageMeta({
			title,
			description,
			path: streakPath(
				user.username,
				streak.league.slug,
				streak.family,
				view.mode,
			),
			image: {
				// Changes whenever a number on the card does, so an unfurl cache
				// holding an older card is handed a url it has never scraped. The
				// proxy route ignores the param. The two modes version separately,
				// so a track going cold re-scrapes instead of serving the run's
				// card back.
				path: `/share/streaks/${user.username}/${streak.league.slug}/${streakFamilyParam(streak.family)}/${view.mode}/card.png?v=${
					view.mode === "cold"
						? coldCardVersion({
								currentColdLength: streak.currentColdLength,
								worstColdLength: streak.worstColdLength,
								lastMissCallId: view.lastCall?.id ?? null,
							})
						: streakCardVersion({
								currentLength: streak.currentLength,
								bestLength: streak.bestLength,
								lastHitCallId: view.lastCall?.id ?? null,
							})
				}`,
				alt: title,
			},
		})
	},
})

function RouteComponent() {
	const {
		username,
		league,
		family: familyParam,
		mode: modeParam,
	} = Route.useParams()
	const family = parseStreakFamilyParam(familyParam)
	const mode = parseStreakMode(modeParam)

	if (!family || !mode) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Streak"
				heading="This streak doesn't exist"
				subtitle={
					family
						? "A streak link ends in /hot or /cold, and this one ends in neither."
						: "Streaks are tracked for winners, totals, props and number guesses, and this link names none of them."
				}
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	return (
		<StreakPage
			username={username}
			league={league}
			family={family}
			mode={mode}
		/>
	)
}
