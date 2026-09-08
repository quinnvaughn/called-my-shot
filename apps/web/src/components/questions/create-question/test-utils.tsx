import { createQuestionSchema } from "@called-my-shot/schemas"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import type { ReactNode } from "react"
import { useForm } from "#/lib/form/use-form"
import type { QuestionData } from "./data-context"
import { QuestionDataProvider } from "./data-context"
import type { CreateQuestionValues } from "./form-context"
import { FormProvider } from "./form-context"

export const DEFAULT_VALUES: CreateQuestionValues = {
	shape: "player_stat_over_under",
	title: "",
	sportId: "",
	leagueId: "",
	gameId: undefined,
	resolutionSource: "",
	resolutionSourceUrl: "",
	locksAt: "",
	isOfficial: false,
	options: [],
	statId: undefined,
	customStat: "",
	ouLine: undefined,
	statAggregation: undefined,
	subjectTeamId: undefined,
	subjectPlayerId: undefined,
	picksRequired: 1,
	awardVerb: undefined,
	eventClause: "",
	awardName: "",
	awardConferences: [],
	awardDivisions: [],
	awardPositions: [],
	awardSeasonsInLeague: [],
	awardRookieOnly: false,
	ballot: undefined,
}

export const EMPTY_DATA: QuestionData = {
	sports: [],
	isAdmin: true,
	teams: [],
	players: [],
	stats: [],
	scopedTeams: [],
	scopedPlayers: [],
	selectedGame: null,
	conferenceOptions: [],
	divisionOptions: [],
	positionOptions: [],
	yearsInLeagueOptions: [],
	awardPoolItems: null,
	gameStatLeaderPoolItems: null,
	finalistItems: null,
	seasonStatLeaderItems: null,
	offersStatAggregation: false,
}

/**
 * Renders one shape panel with the two contexts it reads from, and nothing
 * else - no router, no real data. That a panel needs only this is the point of
 * the split: it takes no props beyond its own shape.
 *
 * The QueryClient is here because the league/game pickers call useQuery even
 * when their `enabled` guard keeps them from fetching.
 */
export function renderPanel(
	ui: ReactNode,
	{
		values,
		data,
	}: {
		values?: Partial<CreateQuestionValues>
		data?: Partial<QuestionData>
	} = {},
) {
	function Wrapper() {
		const form = useForm({
			schema: createQuestionSchema,
			defaultValues: { ...DEFAULT_VALUES, ...values },
		})
		return (
			<QueryClientProvider
				client={
					new QueryClient({
						defaultOptions: { queries: { retry: false } },
					})
				}
			>
				<FormProvider form={form}>
					<QuestionDataProvider value={{ ...EMPTY_DATA, ...data }}>
						{ui}
					</QuestionDataProvider>
				</FormProvider>
			</QueryClientProvider>
		)
	}
	return render(<Wrapper />)
}
