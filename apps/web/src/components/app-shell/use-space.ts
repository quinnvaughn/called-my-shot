import { useLocation } from "@tanstack/react-router"
import { useMemo } from "react"
import { resolveSpace } from "./space"
import type { League } from "./types"

export function useSpace(leagues: League[]) {
	const pathname = useLocation({ select: (location) => location.pathname })
	const leagueSearch = useLocation({
		select: (location) =>
			(location.search as Record<string, unknown>).league ?? null,
	})
	return useMemo(
		() => resolveSpace(pathname, leagueSearch, leagues),
		[pathname, leagueSearch, leagues],
	)
}
