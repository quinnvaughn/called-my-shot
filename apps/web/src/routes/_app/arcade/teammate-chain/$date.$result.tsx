import {
	chainDurationLabel,
	chainResultHeadline,
} from "@called-my-shot/schemas"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { useEffect } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { parseChainResultCode } from "#/components/arcade/teammate-chain/chain-result"
import { ChainRoute } from "#/components/arcade/teammate-chain/chain-route"
import { ChainStrip } from "#/components/arcade/teammate-chain/chain-strip"
import { Avatar } from "#/components/ui/avatar"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { NotFound } from "#/components/ui/not-found"
import { SectionLabel } from "#/components/ui/section-label"
import { UserHandle } from "#/components/users/user-handle"
import { teammateChainShareQuery } from "#/graphql/teammate-chain/queries"
import { pageMeta } from "#/lib/meta"
import { rememberArcadeInvite } from "#/stores/arcade-invite-store"

// Where a shared Teammate Chain result lands. Its preview is the pair, the
// links and the time; once the day is over it shows the sharer's route too,
// and `?v=` flips with it so a link pasted earlier re-scrapes. The page
// itself is a short stop on the way to playing today's.
export const Route = createFileRoute(
	"/_app/arcade/teammate-chain/$date/$result",
)({
	component: RouteComponent,
	staticData: { focus: true },
	validateSearch: z.object({
		invite: z.string().optional().catch(undefined),
		by: z.string().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ by: search.by }),
	loader: async ({ context, params, deps }) => {
		const result = parseChainResultCode(params.result)
		if (!result) throw notFound()
		const data = await context.queryClient.query(
			teammateChainShareQuery(params.date, params.result, deps.by),
		)
		const share = data.teammateChainShare
		return {
			result,
			found: !!share,
			revealed: !!share?.revealed,
			start: share?.puzzle.start.player.name ?? "",
			target: share?.puzzle.target.player.name ?? "",
			par: share?.puzzle.par ?? 0,
			sharer: share?.sharer?.username ?? null,
		}
	},
	notFoundComponent: ShareNotFound,
	head: ({ loaderData, params }) => {
		if (!loaderData?.found) return {}
		const day = seasonDateLabel(params.date)
		const { result } = loaderData
		const who = loaderData.sharer ? `@${loaderData.sharer}` : "Someone"
		const by = loaderData.sharer
			? `by=${encodeURIComponent(loaderData.sharer)}`
			: ""
		const pair = `${loaderData.start} to ${loaderData.target}`
		const hints =
			result.hints === 0
				? ""
				: ` with ${result.hints} ${result.hints === 1 ? "hint" : "hints"}`
		return pageMeta({
			title: loaderData.sharer
				? `@${loaderData.sharer} · Teammate Chain · ${day}`
				: `Teammate Chain · ${day}`,
			description: result.solved
				? `${who} connected ${pair} in ${result.links} links (par ${loaderData.par})${hints} in ${chainDurationLabel(result.seconds)} on ${day}'s Teammate Chain. Can you find a shorter route?`
				: `${who} couldn't connect ${pair} on ${day}'s Teammate Chain. Can you?`,
			path: `/arcade/teammate-chain/${params.date}/${params.result}${by ? `?${by}` : ""}`,
			image: {
				path: `/share/teammate-chain/${params.date}/${params.result}/card.png?v=${loaderData.revealed ? "revealed" : "hidden"}${by ? `&${by}` : ""}`,
				alt: `Teammate Chain, ${day}: ${pair}, ${chainResultHeadline(result.solved ? result.links : null)}`,
			},
		})
	},
})

function ShareNotFound() {
	return (
		<NotFound
			icon={<FaRegTimesCircle size={24} />}
			eyebrowText="Teammate Chain"
			heading="This result link doesn't work"
			subtitle="Today's Teammate Chain is still up for grabs."
			link={{ text: "Play today's", url: "/arcade/teammate-chain" }}
		/>
	)
}

function RouteComponent() {
	const { date, result: code } = Route.useParams()
	const { invite, by } = Route.useSearch()
	const { result } = Route.useLoaderData()
	const { data } = useSuspenseQuery(teammateChainShareQuery(date, code, by))
	const share = data.teammateChainShare
	const sharer = share?.sharer ?? null
	const links = result.solved ? result.links : null

	useEffect(() => {
		if (invite) rememberArcadeInvite(invite)
	}, [invite])

	if (!share) return <ShareNotFound />
	const { puzzle } = share

	return (
		<VStack
			gap="6"
			alignItems="stretch"
			className={css({ maxWidth: "2xl", width: "full", marginInline: "auto" })}
		>
			<div
				className={css({
					bg: "chain.default",
					color: "chain.ink",
					display: "flex",
					flexDirection: "column",
					gap: "5",
					padding: { base: "5", md: "7" },
					borderRadius: "2xl",
				})}
			>
				<span className={css({ textStyle: "label", fontWeight: "bold" })}>
					Teammate Chain · {seasonDateLabel(puzzle.date)} ·{" "}
					{puzzle.league.abbreviation}
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
						<span>{result.solved ? "connected them" : "played it"}</span>
					</span>
				)}
				<span className={css({ fontSize: "md", fontWeight: "semibold" })}>
					{puzzle.start.player.name} to {puzzle.target.player.name}
				</span>
				<h1
					className={css({
						fontFamily: "heading",
						fontSize: { base: "3xl", md: "4xl" },
						lineHeight: "1",
					})}
				>
					{chainResultHeadline(links)}
				</h1>
				<ChainStrip
					start={puzzle.start}
					target={puzzle.target}
					links={links}
					par={puzzle.par}
					seconds={result.solved ? result.seconds : null}
					hints={result.hints}
					misses={result.misses}
				/>
			</div>

			{share.sharerRoute && sharer && (
				<Card>
					<Card.Body>
						<VStack gap="2" alignItems="stretch">
							<SectionLabel>@{sharer.username}'s route</SectionLabel>
							<ChainRoute
								start={puzzle.start}
								target={puzzle.target}
								steps={share.sharerRoute.steps}
								connection={share.sharerRoute.connection}
							/>
						</VStack>
					</Card.Body>
				</Card>
			)}
			{share.parRoute && (
				<Card>
					<Card.Body>
						<VStack gap="2" alignItems="stretch">
							<SectionLabel>A route in {puzzle.par}</SectionLabel>
							<ChainRoute
								start={puzzle.start}
								target={puzzle.target}
								steps={share.parRoute.steps}
								connection={share.parRoute.connection}
							/>
						</VStack>
					</Card.Body>
				</Card>
			)}

			<p className={css({ color: "fg.body" })}>
				Two players a day. Connect them through teammates, players who were on
				the same team in the same season, in as few links as you can.
			</p>
			<Link
				to="/arcade/teammate-chain"
				search={invite ? { invite } : {}}
				className={button({ variant: "solid", size: "md" })}
			>
				{share.revealed ? "Play today's" : "Can you connect them?"}
			</Link>
		</VStack>
	)
}
