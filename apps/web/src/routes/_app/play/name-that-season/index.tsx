import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { css } from "styled-system/css"
import { z } from "zod"
import { NameThatSeasonGame } from "#/components/play/name-that-season/name-that-season-game"
import { EmptyState } from "#/components/ui/empty-state"
import { seasonPuzzleTodayQuery } from "#/graphql/season-puzzles/queries"
import { pageMeta } from "#/lib/meta"
import { rememberSeasonInvite } from "#/stores/season-puzzle-store"

// Today's Name That Season, playable signed out. A shared result link can carry
// the sharer's group invite (?invite=CODE), offered once the game is over.
export const Route = createFileRoute("/_app/play/name-that-season/")({
	component: RouteComponent,
	validateSearch: z.object({
		invite: z.string().optional().catch(undefined),
	}),
	staticData: { focus: true },
	loader: ({ context }) => context.queryClient.query(seasonPuzzleTodayQuery),
	head: () =>
		pageMeta({
			title: "Name That Season · Called My Shot",
			description:
				"One team's season a day. Name the team and the year from six clues. Every wrong guess reveals another.",
			path: "/play/name-that-season",
		}),
})

function RouteComponent() {
	const { invite } = Route.useSearch()
	const { data } = useSuspenseQuery(seasonPuzzleTodayQuery)
	const puzzle = data.seasonPuzzleToday

	useEffect(() => {
		if (invite) rememberSeasonInvite(invite)
	}, [invite])

	if (!puzzle) {
		return (
			<EmptyState>
				There's no season today. A new one goes up at midnight Eastern.
			</EmptyState>
		)
	}

	return (
		<div
			className={css({ maxWidth: "2xl", width: "full", marginInline: "auto" })}
		>
			<NameThatSeasonGame key={puzzle.id} puzzle={puzzle} />
		</div>
	)
}
