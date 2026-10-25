import { useLocation, useMatches } from "@tanstack/react-router"
import { useMemo } from "react"
import { type PageSpace, resolveSpace, spaceOfPage } from "./space"
import type { League, Me } from "./types"

export function useSpace(leagues: League[], me: Me) {
	const pathname = useLocation({ select: (location) => location.pathname })
	const leagueSearch = useLocation({
		select: (location) =>
			(location.search as Record<string, unknown>).league ?? null,
	})
	// The deepest route whose loader said which space its page belongs to.
	const pageSpace = useMatches({
		select: (matches) =>
			[...matches]
				.reverse()
				.map(
					(match) =>
						(match.loaderData as { space?: PageSpace | null } | undefined)
							?.space,
				)
				.find((space) => space != null) ?? null,
	})
	const username = me?.username ?? null
	return useMemo(() => {
		const space = resolveSpace(
			pathname,
			leagueSearch,
			leagues,
			username ? { username } : null,
		)
		if (space.kind !== "elsewhere" || !pageSpace) return space
		return spaceOfPage(pageSpace, leagues) ?? space
	}, [pathname, leagueSearch, leagues, username, pageSpace])
}
