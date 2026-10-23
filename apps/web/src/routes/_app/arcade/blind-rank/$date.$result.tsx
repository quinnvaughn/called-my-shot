import { rankResultHeadline, rankResultLine } from "@called-my-shot/schemas"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { useEffect } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { RankOrderRow } from "#/components/arcade/blind-rank/rank-order-row"
import {
	parseRankSquaresCode,
	rankSquaresCode,
} from "#/components/arcade/blind-rank/rank-result"
import { GuessSquares } from "#/components/arcade/name-that-season/guess-squares"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { Avatar } from "#/components/ui/avatar"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { NotFound } from "#/components/ui/not-found"
import { UserHandle } from "#/components/users/user-handle"
import { rankPuzzleShareQuery } from "#/graphql/blind-rank/queries"
import { pageMeta } from "#/lib/meta"
import { rememberArcadeInvite } from "#/stores/arcade-invite-store"

// Where a shared Blind Rank result lands. Its preview is the prompt and the
// squares; once the day is over it names who was first, and `?v=` flips with
// it so a link pasted earlier re-scrapes. The page itself is a short stop on
// the way to playing today's.
export const Route = createFileRoute("/_app/arcade/blind-rank/$date/$result")({
	component: RouteComponent,
	staticData: { focus: true },
	validateSearch: z.object({
		invite: z.string().optional().catch(undefined),
		by: z.string().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ by: search.by }),
	loader: async ({ context, params, deps }) => {
		const squares = parseRankSquaresCode(params.result)
		if (!squares) throw notFound()
		const data = await context.queryClient.query(
			rankPuzzleShareQuery(params.date, params.result, deps.by),
		)
		const share = data.rankPuzzleShare
		return {
			squares,
			found: !!share,
			revealed: !!share?.answer,
			prompt: share ? `${share.prompt} · ${share.context}` : "",
			sharer: share?.sharer?.username ?? null,
		}
	},
	notFoundComponent: ShareNotFound,
	head: ({ loaderData, params }) => {
		if (!loaderData?.found) return {}
		const day = seasonDateLabel(params.date)
		const code = rankSquaresCode(loaderData.squares)
		const correct = loaderData.squares.filter(Boolean).length
		const who = loaderData.sharer ? `@${loaderData.sharer}` : "Someone"
		const by = loaderData.sharer
			? `by=${encodeURIComponent(loaderData.sharer)}`
			: ""
		return pageMeta({
			title: loaderData.sharer
				? `@${loaderData.sharer} · Blind Rank · ${day}`
				: `Blind Rank · ${day}`,
			description: `${who} placed ${correct === 5 ? "all five" : `${correct} of 5`} right on ${day}'s Blind Rank: ${loaderData.prompt}. Can you do better?`,
			path: `/arcade/blind-rank/${params.date}/${code}${by ? `?${by}` : ""}`,
			image: {
				path: `/share/blind-rank/${params.date}/${code}/card.png?v=${loaderData.revealed ? "revealed" : "hidden"}${by ? `&${by}` : ""}`,
				alt: `Blind Rank, ${day}: ${rankResultHeadline(correct)}`,
			},
		})
	},
})

function ShareNotFound() {
	return (
		<NotFound
			icon={<FaRegTimesCircle size={24} />}
			eyebrowText="Blind Rank"
			heading="This result link doesn't work"
			subtitle="Today's Blind Rank is still up for grabs."
			link={{ text: "Play today's", url: "/arcade/blind-rank" }}
		/>
	)
}

function RouteComponent() {
	const { date, result } = Route.useParams()
	const { invite, by } = Route.useSearch()
	const { squares } = Route.useLoaderData()
	const correct = squares.filter(Boolean).length
	const { data } = useSuspenseQuery(rankPuzzleShareQuery(date, result, by))
	const share = data.rankPuzzleShare
	const sharer = share?.sharer ?? null

	useEffect(() => {
		if (invite) rememberArcadeInvite(invite)
	}, [invite])

	if (!share) return <ShareNotFound />

	return (
		<VStack
			gap="6"
			alignItems="stretch"
			className={css({ maxWidth: "2xl", width: "full", marginInline: "auto" })}
		>
			<div
				className={css({
					bg: "rank.default",
					color: "rank.ink",
					display: "flex",
					flexDirection: "column",
					gap: "5",
					padding: { base: "5", md: "7" },
					borderRadius: "2xl",
				})}
			>
				<span className={css({ textStyle: "label", fontWeight: "bold" })}>
					Blind Rank · {seasonDateLabel(share.date)} ·{" "}
					{share.league.abbreviation}
				</span>
				{sharer && (
					<span
						className={css({
							display: "flex",
							alignItems: "center",
							gap: "2",
							fontSize: "md",
						})}
					>
						<Avatar
							size="xs"
							name={sharer.name ?? sharer.username}
							src={sharer.avatarUrl}
						/>
						<UserHandle user={sharer} />
						<span>played it</span>
					</span>
				)}
				<span className={css({ fontSize: "md", fontWeight: "semibold" })}>
					{share.prompt} · {share.context}
				</span>
				<h1
					className={css({
						fontFamily: "heading",
						fontSize: { base: "3xl", md: "4xl" },
						lineHeight: "1",
					})}
				>
					{rankResultHeadline(correct)}
				</h1>
				<p
					className={css({
						marginTop: "-3",
						fontSize: "lg",
						fontWeight: "semibold",
					})}
				>
					{rankResultLine(correct)}
				</p>
				<div
					className={css({
						display: "flex",
						padding: "3",
						borderRadius: "xl",
						bg: "bg.canvas",
						alignSelf: "flex-start",
					})}
				>
					<GuessSquares
						size="lg"
						squares={squares.map((right) => (right ? "hit" : "miss"))}
					/>
				</div>
			</div>

			{share.answer && (
				<Card>
					<ol className={css({ display: "flex", flexDirection: "column" })}>
						{share.answer.map((a, i) => (
							<RankOrderRow
								key={a.item.label}
								slot={i + 1}
								item={a.item}
								display={a.display}
							/>
						))}
					</ol>
				</Card>
			)}

			<p className={css({ color: "fg.body" })}>
				Five things a day, one at a time. Put each in a slot before you see the
				next, and you can't move them once they're placed.
			</p>
			<Link
				to="/arcade/blind-rank"
				search={invite ? { invite } : {}}
				className={button({ variant: "solid", size: "md" })}
			>
				{share.answer ? "Play today's" : "Can you rank these?"}
			</Link>
		</VStack>
	)
}
