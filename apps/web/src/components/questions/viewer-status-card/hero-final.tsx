import { HeroStat } from "./hero-stat"
import { heroLoseClass, heroWinClass } from "./styles"

// A settled pick's points at headline scale, in place of the pending card's
// "if right / if wrong" pair.
export function HeroFinal({ points }: { points: number }) {
	return points >= 0 ? (
		<HeroStat value={`+${points}`} label="Final" valueClass={heroWinClass} />
	) : (
		<HeroStat
			value={`−${Math.abs(points)}`}
			label="Final"
			valueClass={heroLoseClass}
		/>
	)
}
