import { DateTime } from "luxon"
import { DATE_TIME_PICKER_VALUE_FORMAT } from "#/components/ui/date-time-picker"
import type {
	AwardVerb,
	CreateQuestionInput,
	QuestionShape,
	StatAggregation,
} from "#/graphql/generated/graphql"
import type { CreateQuestionValues } from "./form-context"

// The form's values are the zod schema's shape; the mutation wants the GraphQL
// one. The differences are all mechanical - uppercased enums, empty strings
// dropped to undefined, and the naive datetime resolved to a real instant.
export function toCreateQuestionInput(
	values: CreateQuestionValues,
): CreateQuestionInput {
	return {
		shape: values.shape.toUpperCase() as QuestionShape,
		title: values.title,
		sportId: values.sportId,
		leagueId: values.leagueId,
		gameId: values.gameId,
		resolutionSource: values.resolutionSource,
		resolutionSourceUrl: values.resolutionSourceUrl || undefined,
		// values.locksAt is a naive "yyyy-MM-dd'T'HH:mm" string with no
		// offset - the picker's clock is always the browser's own, so
		// converting it to UTC has to happen here, in that same
		// timezone, rather than trusting the API to guess (it can't -
		// it has no idea what timezone the creator meant).
		locksAt:
			DateTime.fromFormat(values.locksAt, DATE_TIME_PICKER_VALUE_FORMAT)
				.toUTC()
				.toISO() ?? values.locksAt,
		isOfficial: values.isOfficial,
		options: values.options.map((option) => ({
			label: option.label,
			teamId: option.teamId,
			playerId: option.playerId,
		})),
		statId: values.statId,
		customStat: values.customStat || undefined,
		ouLine: values.ouLine,
		statAggregation: values.statAggregation
			? (values.statAggregation.toUpperCase() as StatAggregation)
			: undefined,
		subjectTeamId: values.subjectTeamId,
		subjectPlayerId: values.subjectPlayerId,
		picksRequired: values.picksRequired,
		awardVerb: values.awardVerb
			? (values.awardVerb.toUpperCase() as AwardVerb)
			: undefined,
		eventClause: values.eventClause || undefined,
		awardName: values.awardName || undefined,
		awardConferences: values.awardConferences,
		awardDivisions: values.awardDivisions,
		awardPositions: values.awardPositions,
		awardSeasonsInLeague: values.awardSeasonsInLeague,
		awardRookieOnly: values.awardRookieOnly,
		ballot: values.ballot
			? {
					ballotId: values.ballot.ballotId,
					label: values.ballot.label,
					slot: values.ballot.slot || undefined,
				}
			: undefined,
	}
}
