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
	// The ballot fixed by ?ballotId= on arrival, if any - see BallotField.
	lockedBallotId?: string
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
	teamStatLeaderPoolItems: EntitySearchItem[] | null
	finalistItems: EntitySearchItem[] | null
	seasonStatLeaderItems: EntitySearchItem[] | null
	offersStatAggregation: boolean
}

const QuestionDataContext = createContext<QuestionData | null>(null)

/**
 * The catalog data every shape panel reads, so a panel takes no props at all.
 *
 * Pool items are computed once, above this provider, because the form owner
 * also submits them as `options` (see useCreateQuestionForm) - a panel only
 * displays them.
 *
 * Nothing should put the value this hook returns into a dependency array. It's
 * a fresh object every time the provider re-renders, so `useEffect(…, [data])`
 * re-runs on every render. Destructure first and depend on the field.
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
