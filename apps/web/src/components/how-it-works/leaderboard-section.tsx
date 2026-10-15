import { Accordion } from "#/components/ui/accordion"
import { B } from "./how-it-works-b"
import { P } from "./how-it-works-p"

export function LeaderboardSection() {
	return (
		<Accordion
			title="Leaderboard"
			subtitle="Global by default, narrows to one league"
		>
			<P>
				The leaderboard ranks by <B>total points</B>. The default view sums
				points across every league you've called in; narrow to a single league
				and it re-ranks using points earned in that league alone, not your
				global total.
			</P>
			<P>
				Accuracy follows the same scope: a blended number across every league on
				the global view, and a per-league number once you narrow to one league.
			</P>
		</Accordion>
	)
}
