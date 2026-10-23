import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { css } from "styled-system/css"
import { z } from "zod"
import { NameThatSeasonGame } from "#/components/arcade/name-that-season/name-that-season-game"
import { SeasonPractice } from "#/components/arcade/name-that-season/season-practice"
import { SeasonResetBar } from "#/components/arcade/name-that-season/season-reset-bar"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { EmptyState } from "#/components/ui/empty-state"
import {
	adminSeasonPuzzleQuery,
	seasonPuzzleTodayQuery,
} from "#/graphql/season-puzzles/queries"
import { useMe } from "#/hooks/use-me"
import { pageMeta } from "#/lib/meta"
import { rememberArcadeInvite } from "#/stores/arcade-invite-store"

// Today's Name That Season, playable signed out. A shared result link can carry
// the sharer's group invite (?invite=CODE), offered once the game is over.
export const Route = createFileRoute("/_app/arcade/name-that-season/")({
	component: RouteComponent,
	validateSearch: z.object({
		invite: z.string().optional().catch(undefined),
		// An admin's unsaved practice game on this day's puzzle, from the
		// schedule at /admin/seasons.
		practice: z.string().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ practice: search.practice }),
	staticData: { focus: true },
	loader: ({ context, deps }) =>
		deps.practice
			? context.queryClient.query(adminSeasonPuzzleQuery(deps.practice))
			: context.queryClient.query(seasonPuzzleTodayQuery),
	// Today's league and its first clue on the preview, so a link pasted in a
	// chat says what today's puzzle is, not just which game.
	head: ({ loaderData }) => {
		const puzzle =
			loaderData && "seasonPuzzleToday" in loaderData
				? loaderData.seasonPuzzleToday
				: null
		return pageMeta({
			title: "Name That Season · Called My Shot",
			description: puzzle
				? `Today's puzzle is an ${puzzle.league.abbreviation} season. Name the team and the year from six clues. Every wrong guess reveals another.`
				: "One team's season a day. Name the team and the year from six clues. Every wrong guess reveals another.",
			path: "/arcade/name-that-season",
			image: puzzle
				? {
						path: `/share/name-that-season/${puzzle.date}/card.png`,
						alt: `Name That Season, ${seasonDateLabel(puzzle.date)}: today's ${puzzle.league.abbreviation} season and its first clue`,
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
				<SeasonPractice date={practice} />
			</div>
		)
	}
	return <TodayGame />
}

function TodayGame() {
	const me = useMe()
	const { invite } = Route.useSearch()
	const { data } = useSuspenseQuery(seasonPuzzleTodayQuery)
	const puzzle = data.seasonPuzzleToday

	useEffect(() => {
		if (invite) rememberArcadeInvite(invite)
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
			{me?.isAdmin && <SeasonResetBar />}
			<NameThatSeasonGame key={puzzle.id} puzzle={puzzle} />
		</div>
	)
}
