import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { button } from "#/components/ui/button"
import { arcadeOpenCallsQuery } from "#/graphql/arcade/queries"
import { useMe } from "#/hooks/use-me"

// The way from an arcade game to calls, shown only while some league has a
// game still open to call, so it's never a dead end in the offseason.
export function ArcadeCallsLine({ onClick }: { onClick: () => void }) {
	const me = useMe()
	const { data } = useQuery({ ...arcadeOpenCallsQuery, enabled: !!me })
	const now = Date.now()
	const open = (data?.leagues ?? []).some(
		(l) => l.nextLockAt && Date.parse(l.nextLockAt) > now,
	)
	if (!me || !open) return null
	return (
		<Link to="/home" onClick={onClick} className={button({ variant: "outline" })}>
			Think you know sports? Call today's games
		</Link>
	)
}
