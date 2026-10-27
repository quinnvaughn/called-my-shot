import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { css } from "styled-system/css"
import { z } from "zod"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { ChainPractice } from "#/components/arcade/teammate-chain/chain-practice"
import { ChainResetBar } from "#/components/arcade/teammate-chain/chain-reset-bar"
import { TeammateChainGame } from "#/components/arcade/teammate-chain/teammate-chain-game"
import { EmptyState } from "#/components/ui/empty-state"
import {
	adminTeammateChainPuzzleQuery,
	teammateChainTodayQuery,
} from "#/graphql/teammate-chain/queries"
import { useMe } from "#/hooks/use-me"
import { pageMeta } from "#/lib/meta"
import { rememberArcadeInvite } from "#/stores/arcade-invite-store"

// Today's Teammate Chain, playable signed out. A shared result link can carry
// the sharer's group invite (?invite=CODE), offered once the game is over.
export const Route = createFileRoute("/_app/arcade/teammate-chain/")({
	component: RouteComponent,
	staticData: { focus: true },
	validateSearch: z.object({
		invite: z.string().optional().catch(undefined),
		// An admin's unsaved practice game on this day's chain, from the
		// schedule at /admin/teammate-chain.
		practice: z.string().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ practice: search.practice }),
	loader: ({ context, deps }) =>
		deps.practice
			? context.queryClient.query(adminTeammateChainPuzzleQuery(deps.practice))
			: context.queryClient.query(teammateChainTodayQuery),
	// Today's pair on the preview, so a link pasted in a chat is the dare.
	head: ({ loaderData }) => {
		const puzzle =
			loaderData && "teammateChainToday" in loaderData
				? loaderData.teammateChainToday
				: null
		const pair = puzzle
			? `${puzzle.start.player.name} to ${puzzle.target.player.name}`
			: null
		return pageMeta({
			title: "Teammate Chain · Called My Shot",
			description: pair
				? `Today's chain: ${pair}. Connect them through teammates in as few links as you can. Par is ${puzzle?.par}.`
				: "Connect two players through teammates, in as few links as you can.",
			path: "/arcade/teammate-chain",
			image: puzzle
				? {
						path: `/share/teammate-chain/${puzzle.date}/card.png`,
						alt: `Teammate Chain, ${seasonDateLabel(puzzle.date)}: ${pair}`,
					}
				: undefined,
		})
	},
})

function RouteComponent() {
	const { practice } = Route.useSearch()
	if (practice) {
		return (
			<div
				className={css({
					maxWidth: "2xl",
					width: "full",
					marginInline: "auto",
				})}
			>
				<ChainPractice date={practice} />
			</div>
		)
	}
	return <TodayGame />
}

function TodayGame() {
	const me = useMe()
	const { invite } = Route.useSearch()
	const { data } = useSuspenseQuery(teammateChainTodayQuery)
	const puzzle = data.teammateChainToday

	useEffect(() => {
		if (invite) rememberArcadeInvite(invite)
	}, [invite])

	if (!puzzle) {
		return (
			<EmptyState>
				There's no Teammate Chain today. A new one goes up at midnight Eastern.
			</EmptyState>
		)
	}

	return (
		<div
			className={css({ maxWidth: "2xl", width: "full", marginInline: "auto" })}
		>
			{me?.isAdmin && <ChainResetBar />}
			<TeammateChainGame key={puzzle.id} puzzle={puzzle} />
		</div>
	)
}
