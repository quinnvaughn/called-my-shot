import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { css } from "styled-system/css"
import { z } from "zod"
import { BlindRankGame } from "#/components/arcade/blind-rank/blind-rank-game"
import { RankPractice } from "#/components/arcade/blind-rank/rank-practice"
import { RankResetBar } from "#/components/arcade/blind-rank/rank-reset-bar"
import { EmptyState } from "#/components/ui/empty-state"
import {
	adminRankPuzzleQuery,
	rankPuzzleTodayQuery,
} from "#/graphql/blind-rank/queries"
import { useMe } from "#/hooks/use-me"
import { pageMeta } from "#/lib/meta"
import { rememberArcadeInvite } from "#/stores/arcade-invite-store"

// Today's Blind Rank, playable signed out. A shared result link can carry the
// sharer's group invite (?invite=CODE), offered once the game is over.
export const Route = createFileRoute("/_app/arcade/blind-rank/")({
	component: RouteComponent,
	staticData: { focus: true },
	validateSearch: z.object({
		invite: z.string().optional().catch(undefined),
		// An admin's unsaved practice game on this day's puzzle, from the
		// schedule at /admin/blind-rank.
		practice: z.string().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ practice: search.practice }),
	loader: ({ context, deps }) =>
		deps.practice
			? context.queryClient.query(adminRankPuzzleQuery(deps.practice))
			: context.queryClient.query(rankPuzzleTodayQuery),
	head: () =>
		pageMeta({
			title: "Blind Rank · Called My Shot",
			description:
				"Five things, one at a time. Rank each before you see the next, and you can't move them once they're placed.",
			path: "/arcade/blind-rank",
		}),
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
				<RankPractice date={practice} />
			</div>
		)
	}
	return <TodayGame />
}

function TodayGame() {
	const me = useMe()
	const { invite } = Route.useSearch()
	const { data } = useSuspenseQuery(rankPuzzleTodayQuery)
	const puzzle = data.rankPuzzleToday

	useEffect(() => {
		if (invite) rememberArcadeInvite(invite)
	}, [invite])

	if (!puzzle) {
		return (
			<EmptyState>
				There's no Blind Rank today. A new one goes up at midnight Eastern.
			</EmptyState>
		)
	}

	return (
		<div
			className={css({ maxWidth: "2xl", width: "full", marginInline: "auto" })}
		>
			{me?.isAdmin && <RankResetBar />}
			<BlindRankGame key={puzzle.id} puzzle={puzzle} />
		</div>
	)
}
