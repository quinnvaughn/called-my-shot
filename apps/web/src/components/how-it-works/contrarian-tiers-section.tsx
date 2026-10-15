import { TIER_MAX_MULT, TIER_MIN_MULT } from "@called-my-shot/scoring"
import { Accordion } from "#/components/ui/accordion"
import { CurveScale } from "./curve-scale"
import { P } from "./how-it-works-p"

export function ContrarianTiersSection() {
	return (
		<Accordion
			title="Contrarian tiers"
			subtitle="Rarer picks score higher, only on a hit"
		>
			<P>
				Your tier isn't something you choose: it's set automatically by how much
				of the field's conviction went on the same thing you picked, measured
				against the field's final makeup once the question resolves, and
				relative to how many options the question even had (1-in-20 means
				something different than 1-in-2). It counts conviction, not heads, so a
				call made at 1% barely moves anyone else's tier. The rarer your pick,
				the higher the multiplier on a win, scaling smoothly rather than in
				fixed steps. This applies to every option-based shape: stat lines,
				props, head-to-head picks, award finalists, and each pick within a
				season-long award. The numeric-guess shapes work differently (see
				below).
			</P>
			<CurveScale
				labels={["SAFE", "STEADY", "BOLD", "DARING", "FEARLESS"]}
				floorMult={`×${TIER_MIN_MULT}`}
				ceilingMult={`×${TIER_MAX_MULT}`}
			/>
			<P>
				A question whose sides are priced (see below) has no boldness bonus.
				Each side's price already pays for how unlikely it is, so how many
				people took it doesn't change your points.
			</P>
			<P>
				The multiplier only applies on a hit. Miss, and you lose what you
				committed (or a set share of it on the harder question types, see
				below); the tier doesn't make a miss cost more.
			</P>
		</Accordion>
	)
}
