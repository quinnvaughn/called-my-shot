import { seasonResultLine } from "@called-my-shot/schemas"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { useEffect } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { GuessSquares } from "#/components/arcade/name-that-season/guess-squares"
import {
	parseSeasonSquaresCode,
	seasonDateLabel,
	seasonGuessCount,
	seasonResultHeadline,
	seasonSquares,
	seasonSquaresCode,
} from "#/components/arcade/name-that-season/season-result"
import { Avatar } from "#/components/ui/avatar"
import { button } from "#/components/ui/button"
import { NotFound } from "#/components/ui/not-found"
import { TeamBadge } from "#/components/ui/team-badge"
import { UserHandle } from "#/components/users/user-handle"
import { seasonPuzzleShareQuery } from "#/graphql/season-puzzles/queries"
import { pageMeta } from "#/lib/meta"
import { rememberArcadeInvite } from "#/stores/arcade-invite-store"

// Where a shared Name That Season result lands. Its preview is the squares, and
// on the day it gives nothing away; once the day is over it names the season,
// and `?v=` flips with it so a link pasted earlier re-scrapes. The page itself
// is a short stop on the way to playing today's.
export const Route = createFileRoute(
	"/_app/arcade/name-that-season/$date/$result",
)({
	component: RouteComponent,
	staticData: { focus: true },
	validateSearch: z.object({
		invite: z.string().optional().catch(undefined),
		by: z.string().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ by: search.by }),
	loader: async ({ context, params, deps }) => {
		const outcomes = parseSeasonSquaresCode(params.result)
		if (!outcomes) throw notFound()
		const data = await context.queryClient.query(
			seasonPuzzleShareQuery(params.date, params.result, deps.by),
		)
		const share = data.seasonPuzzleShare
		return {
			outcomes,
			found: !!share,
			revealed: !!share?.answer,
			sharer: share?.sharer?.username ?? null,
		}
	},
	notFoundComponent: ShareNotFound,
	head: ({ loaderData, params }) => {
		if (!loaderData?.found) return {}
		const day = seasonDateLabel(params.date)
		const code = seasonSquaresCode(loaderData.outcomes)
		const guessCount = seasonGuessCount(loaderData.outcomes)
		const who = loaderData.sharer ? `@${loaderData.sharer}` : null
		const result =
			guessCount === null
				? `${who ?? "Someone"} couldn't name ${day}'s season. Can you?`
				: `${who ?? "Someone"} named ${day}'s season in ${guessCount}. Can you?`
		return pageMeta({
			title: who
				? `${who} · Name That Season · ${day}`
				: `Name That Season · ${day}`,
			description: result,
			path: `/arcade/name-that-season/${params.date}/${code}${
				loaderData.sharer ? `?by=${encodeURIComponent(loaderData.sharer)}` : ""
			}`,
			image: {
				path: `/share/name-that-season/${params.date}/${code}/card.png?v=${loaderData.revealed ? "revealed" : "hidden"}${
					loaderData.sharer
						? `&by=${encodeURIComponent(loaderData.sharer)}`
						: ""
				}`,
				alt: `Name That Season, ${day}: ${seasonResultHeadline(guessCount)}`,
			},
		})
	},
})

function ShareNotFound() {
	return (
		<NotFound
			icon={<FaRegTimesCircle size={24} />}
			eyebrowText="Name That Season"
			heading="This result link doesn't work"
			subtitle="Today's season is still up for grabs."
			link={{ text: "Play today's", url: "/arcade/name-that-season" }}
		/>
	)
}

function RouteComponent() {
	const { date, result } = Route.useParams()
	const { invite, by } = Route.useSearch()
	const { outcomes } = Route.useLoaderData()
	const guessCount = seasonGuessCount(outcomes)
	const { data } = useSuspenseQuery(seasonPuzzleShareQuery(date, result, by))
	const share = data.seasonPuzzleShare
	const sharer = share?.sharer ?? null

	useEffect(() => {
		if (invite) rememberArcadeInvite(invite)
	}, [invite])

	if (!share) return <ShareNotFound />

	const answer = share.answer

	return (
		<VStack
			gap="6"
			alignItems="stretch"
			className={css({ maxWidth: "2xl", width: "full", marginInline: "auto" })}
		>
			<div
				className={css({
					bg: "season.default",
					color: "season.ink",
					display: "flex",
					flexDirection: "column",
					gap: "5",
					padding: { base: "5", md: "7" },
					borderRadius: "2xl",
				})}
			>
				<span className={css({ textStyle: "label", fontWeight: "bold" })}>
					Name That Season · {seasonDateLabel(share.date)} ·{" "}
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
				<h1
					className={css({
						fontFamily: "heading",
						fontSize: { base: "3xl", md: "4xl" },
						lineHeight: "1",
					})}
				>
					{seasonResultHeadline(guessCount)}
				</h1>
				<p
					className={css({
						marginTop: "-3",
						fontSize: "lg",
						fontWeight: "semibold",
					})}
				>
					{seasonResultLine(guessCount)}
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
					<GuessSquares size="lg" squares={seasonSquares(outcomes)} />
				</div>
			</div>

			{answer && (
				<div
					className={css({ display: "flex", alignItems: "center", gap: "3" })}
				>
					<TeamBadge
						abbreviation={answer.team.abbreviation}
						color={answer.team.color}
						logoUrl={answer.team.logoUrl}
						size="lg"
					/>
					<span className={css({ fontSize: "lg", fontWeight: "semibold" })}>
						It was the {answer.label} {answer.name}
					</span>
				</div>
			)}

			<p className={css({ color: "fg.body" })}>
				One team's season a day. You name the team and the year from its record,
				its stat leaders and how it ended. Every wrong guess reveals another
				clue, and the right team in the wrong year tells you to go earlier or
				later.
			</p>
			<Link
				to="/arcade/name-that-season"
				search={invite ? { invite } : {}}
				className={button({ variant: "solid", size: "md" })}
			>
				{answer ? "Play today's" : "Can you name this season?"}
			</Link>
		</VStack>
	)
}
