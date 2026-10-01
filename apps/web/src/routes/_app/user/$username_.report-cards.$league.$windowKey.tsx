import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { ReportCard } from "#/components/report-cards/report-card"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { userReportCardPageQuery } from "#/graphql/queries/report-cards"
import { pageMeta } from "#/lib/meta"
import {
	isEmptyReportCard,
	reportCardPageMeta,
	reportCardPath,
	reportCardVersion,
} from "#/lib/report-card"

// Public, like /calls/:id - this url exists to be pasted somewhere. Not a
// child of /user/$username (that page has no outlet), hence the trailing
// underscore. Left out of the sitemap for the same reason calls are.
export const Route = createFileRoute(
	"/_app/user/$username_/report-cards/$league/$windowKey",
)({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			userReportCardPageQuery(params.username, params.league, params.windowKey),
		)
		return { user: data.userByUsername ?? null }
	},
	head: ({ loaderData }) => {
		const user = loaderData?.user
		const card = user?.reportCard
		if (!user || !card) return {}

		const track = `${card.league.abbreviation.toUpperCase()} ${card.windowLabel}`
		const { title, description } = reportCardPageMeta({
			username: user.username,
			track,
			wins: card.wins,
			losses: card.losses,
			netPoints: card.netPoints,
			committedPoints: card.committedPoints,
			returnPct: card.returnPct ?? null,
			grade: card.grade ?? null,
			isFinal: card.isFinal,
		})

		return pageMeta({
			title,
			description,
			path: reportCardPath(user.username, card.league.slug, card.windowKey),
			image: {
				// Changes whenever a number on the og:image does, so an unfurl
				// cache holding an older render is handed a url it has never
				// scraped. This one has to move while a slate is still settling,
				// not just at the end. The proxy route ignores the param.
				path: `/share/report-cards/${user.username}/${card.league.slug}/${card.windowKey}/card.png?v=${reportCardVersion(
					{
						grade: card.grade ?? null,
						wins: card.wins,
						losses: card.losses,
						netPoints: card.netPoints,
						pendingCount: card.pendingCount,
					},
				)}`,
				alt: title,
			},
		})
	},
})

function RouteComponent() {
	const { username, league, windowKey } = Route.useParams()
	const { data } = useSuspenseQuery(
		userReportCardPageQuery(username, league, windowKey),
	)
	const { me } = useRouteContext({ from: "__root__" })
	const user = data.userByUsername
	const card = user?.reportCard

	if (!user) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Report Card"
				heading="This user doesn't exist"
				subtitle="They may have changed their username, or the link's just wrong."
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	// Null only when the league or the window key names nothing. A window
	// they simply sat out still returns a card, handled below.
	if (!card) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Report Card"
				heading="No such week"
				subtitle="That league doesn't have a window by that name. The link may be wrong, or point at a season that was never synced."
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	const track = `${card.league.abbreviation.toUpperCase()} ${card.windowLabel}`
	const isOwn = me?.id === user.id
	const empty = isEmptyReportCard(card)

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "2xl" })}>
			<Breadcrumb>
				<Breadcrumb.Link
					to="/user/$username"
					params={{ username: user.username }}
				>
					@{user.username}
				</Breadcrumb.Link>
				<Breadcrumb.Current>{track} Report Card</Breadcrumb.Current>
			</Breadcrumb>

			<PageHeader title={`${track} Report Card`} subtitle={user.name} />

			{empty ? (
				<>
					{/* The window exists, they just have nothing in it. Worth saying
					    outright, since a blank page reads as a broken link. The
					    games link lives in the card's footer otherwise. */}
					<span className={css({ fontSize: "sm", color: "fg.muted" })}>
						{isOwn ? "You didn't call" : `@${user.username} didn't call`}{" "}
						anything in {track}.
					</span>
					<Link
						to="/leagues/$leagueSlug/games"
						params={{ leagueSlug: card.league.slug }}
						search={{ windowKey: card.windowKey }}
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							textTransform: "uppercase",
							color: "primary.default",
							textDecoration: "none",
							_hover: { opacity: 0.8 },
						})}
					>
						See the games →
					</Link>
				</>
			) : (
				// Expanded: the permalink has the room to split each family into
				// the shapes behind it, which the inline card doesn't.
				<ReportCard
					card={card}
					expanded
					owner={{ id: user.id, username: user.username, isOwn }}
				/>
			)}
		</VStack>
	)
}
