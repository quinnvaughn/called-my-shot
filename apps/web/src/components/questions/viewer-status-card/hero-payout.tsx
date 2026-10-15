import { HStack } from "styled-system/jsx"
import { HeroStat } from "./hero-stat"
import { heroLoseClass, heroWinClass } from "./styles"

// The payout at headline scale: what the pick pays if right and costs if
// wrong, each labelled, under the pick they belong to.
export function HeroPayout({ win, lose }: { win: string; lose: string }) {
	return (
		<HStack gap="8" alignItems="flex-start">
			<HeroStat value={win} label="If right" valueClass={heroWinClass} />
			<HeroStat value={lose} label="If wrong" valueClass={heroLoseClass} />
		</HStack>
	)
}
