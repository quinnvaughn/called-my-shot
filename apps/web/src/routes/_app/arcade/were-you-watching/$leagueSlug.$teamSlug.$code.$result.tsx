import {
	parseWatchResultCode,
	possessive,
	teamNickname,
	watchResultHeadline,
} from "@called-my-shot/schemas"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { useEffect } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { FiClock } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { ChainStatChip } from "#/components/arcade/teammate-chain/chain-stat-chip"
import { WatchBoard } from "#/components/arcade/were-you-watching/watch-board"
import { WatchCleanTag } from "#/components/arcade/were-you-watching/watch-clean-tag"
import { watchGameDay } from "#/components/arcade/were-you-watching/watch-codes"
import { Avatar } from "#/components/ui/avatar"
import { button } from "#/components/ui/button"
import { NotFound } from "#/components/ui/not-found"
import { UserHandle } from "#/components/users/user-handle"
import { watchQuizByCodeQuery } from "#/graphql/were-you-watching/queries"
import { pageMeta } from "#/lib/meta"
import { rememberArcadeInvite } from "#/stores/arcade-invite-store"

// Where a shared Were You Watching? result lands: the score and time,
// whose it is when the link's result is really theirs, and the way to take
// the same quiz.
export const Route = createFileRoute(
	"/_app/arcade/were-you-watching/$leagueSlug/$teamSlug/$code/$result",
)({
	component: RouteComponent,
	notFoundComponent: ShareNotFound,
	staticData: { focus: true },
	validateSearch: z.object({
		invite: z.string().optional().catch(undefined),
		by: z.string().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ by: search.by }),
	loader: async ({ context, params, deps }) => {
		const result = parseWatchResultCode(params.result)
		if (!result) throw notFound()
		const data = await context.queryClient.query(
			watchQuizByCodeQuery(params.leagueSlug, params.teamSlug, params.code, {
				result: params.result,
				by: deps.by,
			}),
		)
		const quiz = data.watchQuizByCode
		if (!quiz) throw notFound()
		return {
			result,
			team: quiz.team.name,
			opponent: quiz.opponent.name,
			day: watchGameDay(quiz.gameStartsAt),
			sharer: quiz.sharer?.username ?? null,
		}
	},
	head: ({ loaderData, params }) => {
		if (!loaderData) return {}
		const { result } = loaderData
		const team = teamNickname(loaderData.team)
		const who = loaderData.sharer ? `@${loaderData.sharer}` : "Someone"
		const by = loaderData.sharer
			? `by=${encodeURIComponent(loaderData.sharer)}`
			: ""
		const base = `/arcade/were-you-watching/${params.leagueSlug}/${params.teamSlug}/${params.code}/${params.result}`
		return pageMeta({
			title: loaderData.sharer
				? `@${loaderData.sharer} · Were You Watching? ${team}`
				: `Were You Watching? ${team}`,
			description: `${who} got ${result.correct} of ${result.total} in ${result.seconds.toFixed(1)}s on the ${possessive(team)} ${loaderData.day} game against the ${teamNickname(loaderData.opponent)}. Were you watching?`,
			path: `${base}${by ? `?${by}` : ""}`,
			image: {
				path: `/share/were-you-watching/${params.leagueSlug}/${params.teamSlug}/${params.code}/${params.result}/card.png${by ? `?${by}` : ""}`,
				alt: `Were You Watching? ${team}: ${result.correct} of ${result.total}`,
			},
		})
	},
})

function ShareNotFound() {
	return (
		<NotFound
			icon={<FaRegTimesCircle size={24} />}
			eyebrowText="Were You Watching?"
			heading="This result link doesn't work"
			subtitle="Your team's quiz on its last game is still up for grabs."
			link={{ text: "Pick a team", url: "/arcade/were-you-watching" }}
		/>
	)
}

function RouteComponent() {
	const { leagueSlug, teamSlug, code, result: resultCode } = Route.useParams()
	const { invite, by } = Route.useSearch()
	const { result } = Route.useLoaderData()
	const { data } = useSuspenseQuery(
		watchQuizByCodeQuery(leagueSlug, teamSlug, code, {
			result: resultCode,
			by,
		}),
	)
	const quiz = data.watchQuizByCode

	useEffect(() => {
		if (invite) rememberArcadeInvite(invite)
	}, [invite])

	if (!quiz) return <ShareNotFound />
	const sharer = quiz.sharer ?? null
	const team = teamNickname(quiz.team.name)

	return (
		<VStack
			gap="6"
			alignItems="stretch"
			className={css({ maxWidth: "2xl", width: "full", marginInline: "auto" })}
		>
			<div
				className={css({
					bg: "watch.default",
					color: "watch.ink",
					display: "flex",
					flexDirection: "column",
					gap: "4",
					padding: { base: "5", md: "7" },
					borderRadius: "2xl",
				})}
			>
				<span className={css({ textStyle: "label", fontWeight: "bold" })}>
					Were You Watching? · {watchGameDay(quiz.gameStartsAt)} ·{" "}
					{quiz.league.abbreviation}
				</span>
				{sharer && (
					<span
						className={css({
							display: "flex",
							alignItems: "center",
							gap: "2",
						})}
					>
						<Avatar
							size="xs"
							name={sharer.name ?? sharer.username}
							src={sharer.avatarUrl}
						/>
						<UserHandle user={sharer} />
						<span>took the quiz</span>
					</span>
				)}
				<span className={css({ fontSize: "md", fontWeight: "semibold" })}>
					{team} vs {teamNickname(quiz.opponent.name)}
				</span>
				<h1
					className={css({
						fontFamily: "heading",
						fontSize: { base: "3xl", md: "4xl" },
						lineHeight: "1",
					})}
				>
					{watchResultHeadline(result.correct, result.total)}
				</h1>
				<div
					className={css({
						display: "flex",
						alignItems: "center",
						gap: "2",
						flexWrap: "wrap",
					})}
				>
					<ChainStatChip
						icon={<FiClock aria-hidden size={14} />}
						value={`${result.seconds.toFixed(1)}s`}
						label={`Time ${result.seconds.toFixed(1)} seconds`}
					/>
					{result.clean && <WatchCleanTag />}
				</div>
			</div>
			<p className={css({ color: "fg.body" })}>
				Questions on the {possessive(team)} last game, straight from the box
				score. Four choices and 10 seconds each, so there's no time to look it
				up.
			</p>
			<Link
				to="/arcade/were-you-watching/$leagueSlug/$teamSlug"
				params={{ leagueSlug, teamSlug }}
				search={invite ? { invite } : {}}
				className={button({ variant: "solid", size: "md" })}
			>
				{quiz.live
					? "Were you watching?"
					: `Play the ${possessive(team)} latest`}
			</Link>
			<WatchBoard
				rows={quiz.board}
				total={quiz.questionCount}
				playerCount={quiz.playerCount}
			/>
		</VStack>
	)
}
