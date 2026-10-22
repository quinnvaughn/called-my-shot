import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { button } from "#/components/ui/button"
import { seasonOpenCallsQuery } from "#/graphql/season-puzzles/queries"
import { useMe } from "#/hooks/use-me"
import { track } from "#/lib/analytics"

// The way from the game to calls, shown only while some league has a game
// still open to call, so it's never a dead end in the offseason.
export function SeasonCallsLine() {
	const me = useMe()
	const { data } = useQuery({ ...seasonOpenCallsQuery, enabled: !!me })
	const now = Date.now()
	const open = (data?.leagues ?? []).some(
		(l) => l.nextLockAt && Date.parse(l.nextLockAt) > now,
	)
	if (!me || !open) return null
	return (
		<Link
			to="/home"
			onClick={() => track("season_next_step_clicked", { step: "calls" })}
			className={button({ variant: "ghost" })}
		>
			Think you know sports? Call today's games
		</Link>
	)
}
