import { css } from "styled-system/css"
import { pluralize } from "#/lib/pluralize"

// How a solved route compares with everyone else's today. Counted live, so
// it says "so far" until the day is over.
export function ChainRarity({
	solvers,
	sameRoute,
}: {
	solvers: number
	sameRoute: number
}) {
	const others = solvers - 1
	const line =
		others === 0
			? "You're the first to solve today's chain. The shares beside each player fill in as others finish."
			: sameRoute === 1
				? `Nobody else has taken your route. ${others} other ${pluralize(others, "player")} solved it a different way so far.`
				: `${sameRoute} of the ${solvers} players who solved it so far took this exact route.`
	return (
		<p
			className={css({
				fontSize: "sm",
				fontWeight: "medium",
				color: "fg.body",
			})}
		>
			{line}
		</p>
	)
}
