import type { ReactNode } from "react"
import { createContext, useContext } from "react"
import type { SportsQuery } from "#/graphql/generated/graphql"
import type { EntitySearchItem } from "./entity-search-field"
import type {
	CatalogPlayer,
	CatalogStat,
	CatalogTeam,
	SelectedGame,
} from "./use-question-catalog"

export type QuestionData = {
	sports: SportsQuery["sports"]
	isAdmin: boolean
	teams: CatalogTeam[]
	players: CatalogPlayer[]
	stats: CatalogStat[]
	scopedTeams: CatalogTeam[]
	scopedPlayers: CatalogPlayer[]
	selectedGame: SelectedGame | null
	conferenceOptions: string[]
	divisionOptions: string[]
	positionOptions: string[]
	yearsInLeagueOptions: number[]
	awardPoolItems: EntitySearchItem[] | null
	gameStatLeaderPoolItems: EntitySearchItem[] | null
	finalistItems: EntitySearchItem[] | null
	seasonStatLeaderItems: EntitySearchItem[] | null
	offersStatAggregation: boolean
}

const QuestionDataContext = createContext<QuestionData | null>(null)

/**
 * The catalog data every shape panel reads, so a panel takes no props at all.
 *
 * Two rules keep this safe, both of them about the PoolSummary loop (see
 * use-entity-pools.ts):
 *
 * 1. Pool items are computed once, above this provider. Computing them inside a
 *    panel would put them in a component that re-renders on every `options`
 *    write, which is the original infinite loop relocated.
 * 2. Nothing puts the value this hook returns into a dependency array. It's a
 *    fresh object every time the provider re-renders, so `useEffect(…, [data])`
 *    loops immediately. Destructure first and depend on the field.
 *
 * Deliberately carries no watched form scalar - a panel that needs `leagueId`
 * or `awardConferences` reads it with useWatch, so typing in one field doesn't
 * churn this value and re-render every panel.
 */
export function QuestionDataProvider({
	value,
	children,
}: {
	value: QuestionData
	children: ReactNode
}) {
	return (
		<QuestionDataContext.Provider value={value}>
			{children}
		</QuestionDataContext.Provider>
	)
}

export function useQuestionData(part: string): QuestionData {
	const ctx = useContext(QuestionDataContext)
	if (!ctx) {
		throw new Error(
			`QuestionData.${part} must be rendered inside <QuestionDataProvider>`,
		)
	}
	return ctx
}
