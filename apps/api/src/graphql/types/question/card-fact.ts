import type {
	CardFact,
	CardFactKind,
	CardFactSide,
} from "../../../lib/card-fact/build"
import { builder } from "../../builder"

const KINDS: CardFactKind[] = [
	"line_hits",
	"total_hits",
	"averages",
	"leader_hits",
]

export const CardFactKindEnum = builder.enumType("CardFactKind", {
	values: Object.fromEntries(
		KINDS.map((value) => [value.toUpperCase(), { value }]),
	) as Record<string, { value: CardFactKind }>,
})

const CardFactSideRef = builder
	.objectRef<CardFactSide>("CardFactSide")
	.implement({
		fields: (t) => ({
			label: t.exposeString("label"),
			// Games the figures are over, at most ten.
			games: t.exposeInt("games"),
			// Null where the fact's kind counts nothing (an average).
			hits: t.int({ nullable: true, resolve: (s) => s.hits }),
			mean: t.exposeFloat("mean"),
		}),
	})

export const CardFactRef = builder.objectRef<CardFact>("CardFact").implement({
	fields: (t) => ({
		kind: t.field({ type: CardFactKindEnum, resolve: (f) => f.kind }),
		statLabel: t.exposeString("statLabel"),
		line: t.float({ nullable: true, resolve: (f) => f.line }),
		sides: t.field({ type: [CardFactSideRef], resolve: (f) => f.sides }),
	}),
})
