import { statInSentence } from "@called-my-shot/schemas"
import { match } from "ts-pattern"
import type { CardFactKind } from "#/graphql/generated/graphql"

// The sentence under a game-page card's options: one fact about recent form,
// built from Question.cardFact's numbers. Figures come back marked so the card
// can set them apart from the words around them.

export type CardFactPart = string | { figure: string }

type Side = {
	label: string
	games: number
	hits?: number | null
	mean: number
}

export type CardFactInput = {
	kind: CardFactKind
	statLabel: string
	line?: number | null
	sides: Side[]
}

const figure = (value: number | string): CardFactPart => ({
	figure: String(value),
})

const average = (mean: number) => figure(mean.toFixed(1))

// "last 10 games", or "last 4 games" early in a season.
const lastGames = (games: number) => `last ${games} games`

export function cardFactParts(fact: CardFactInput): CardFactPart[] | null {
	const [a, b] = fact.sides
	const stat = statInSentence(fact.statLabel)
	const line = fact.line ?? null
	if (!a) return null

	return match(fact.kind)
		.returnType<CardFactPart[] | null>()
		.with("LINE_HITS", () =>
			line === null
				? null
				: [
						"Over ",
						figure(line),
						" in ",
						figure(a.hits ?? 0),
						` of ${lastGames(a.games)}`,
					],
		)
		.with("TOTAL_HITS", () =>
			line === null || !b
				? null
				: [
						"Combined over ",
						figure(line),
						" in ",
						figure(a.hits ?? 0),
						` of ${a.label}'s last ${a.games}, `,
						figure(b.hits ?? 0),
						` of ${b.label}'s last ${b.games}`,
					],
		)
		.with("AVERAGES", () =>
			b
				? [
						a.games === b.games ? `Last ${a.games} avg: ` : "Recent avg: ",
						`${a.label} `,
						average(a.mean),
						`, ${b.label} `,
						average(b.mean),
						` ${stat}`,
					]
				: null,
		)
		.with("LEADER_HITS", () => [
			`${a.label} led the game in ${stat} in `,
			figure(a.hits ?? 0),
			` of ${lastGames(a.games)}`,
		])
		.exhaustive()
}
