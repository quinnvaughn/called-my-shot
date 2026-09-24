import type {
	Call,
	Question,
	questionReports,
	resolutionDisputes,
} from "../../../db/schema"
import { builder } from "../../builder"
import { BallotQuestionInput } from "../ballot"
import { CallRef } from "./call"
import {
	AwardVerb,
	QuestionShape,
	QuestionVoidedReason,
	StatAggregation,
	VoidReason,
} from "./enums"
import { QuestionReportRef, ResolutionDisputeRef } from "./moderation-objects"
import { QuestionRef } from "./question-object"

export const QuestionPayload = builder
	.objectRef<{ question: Question }>("QuestionPayload")
	.implement({
		fields: (t) => ({
			question: t.field({
				type: QuestionRef,
				resolve: (payload) => payload.question,
			}),
		}),
	})

const CreateQuestionOptionInput = builder.inputType(
	"CreateQuestionOptionInput",
	{
		fields: (t) => ({
			label: t.string({ required: true }),
			teamId: t.id({ required: false }),
			playerId: t.id({ required: false }),
		}),
	},
)

export const CreateQuestionInput = builder.inputType("CreateQuestionInput", {
	fields: (t) => ({
		shape: t.field({ type: QuestionShape, required: true }),
		sportId: t.id({ required: true }),
		leagueId: t.id({ required: true }),
		gameId: t.id({ required: false }),

		// Required - the create-question form prefills this from
		// generateQuestionTitle and lets the creator edit it, since the
		// generated phrasing doesn't always read naturally (an unusual stat or
		// award name especially). The server trusts whatever's here rather than
		// regenerating its own copy.
		title: t.string({ required: true }),

		resolutionSource: t.string({ required: true }),
		resolutionSourceUrl: t.string({ required: false }),
		locksAt: t.string({ required: true }),
		isOfficial: t.boolean({ required: false }),

		// player_vs_player and team_vs_team_season (exactly 2), award pools
		// (player_season_award/team_season_award), player_award_finalists (2+) -
		// not sent for team_vs_team, which the resolver derives from the picked
		// game
		options: t.field({
			type: [CreateQuestionOptionInput],
			required: false,
		}),

		// *_over_under, *_numeric_guess, player_vs_player
		statId: t.id({ required: false }),
		customStat: t.string({ required: false }),

		// *_over_under
		ouLine: t.float({ required: false }),

		// Every season-scoped stat shape: the two season over/unders and the
		// two season head-to-heads (player_vs_player_season/team_vs_team_season)
		statAggregation: t.field({ type: StatAggregation, required: false }),

		// player/team_stat_over_under, player/team_stat_numeric_guess
		// (required), yes_no_prop (optional)
		subjectTeamId: t.id({ required: false }),
		subjectPlayerId: t.id({ required: false }),

		// player_season_award/team_season_award
		picksRequired: t.int({ required: false }),
		// player_season_award/team_season_award only - see AwardVerb above.
		awardVerb: t.field({ type: AwardVerb, required: false }),

		// yes_no_prop only
		eventClause: t.string({ required: false }),

		// player_season_award/team_season_award/player_award_finalists
		awardName: t.string({ required: false }),

		// player_season_award/team_season_award only - narrows the pool the
		// resolver derives server-side (see createQuestion below) instead of
		// the whole league. IN filtering - e.g. ["SP", "RP"] for a Cy Young race
		// that spans both starters and relievers.
		awardConferences: t.field({ type: ["String"], required: false }),
		awardDivisions: t.field({ type: ["String"], required: false }),
		// player_season_award only
		awardPositions: t.field({ type: ["String"], required: false }),
		// player_season_award only - a genuine exact-experience-year race (e.g.
		// [1] for a "best second-year player" poll). NOT used for Rookie of the
		// Year - see awardRookieOnly below.
		awardSeasonsInLeague: t.field({ type: ["Int"], required: false }),
		// player_season_award only - narrows the pool to rookie-eligible players
		// per that sport's own real rookie rule. The mechanism for every real
		// Rookie of the Year question regardless of sport.
		awardRookieOnly: t.field({ type: "Boolean", required: false }),

		// Admin-only placement into a Ballot - absent for the overwhelming
		// majority of questions, which aren't part of any ballot. Forces
		// isOfficial (see createQuestionSchema's superRefine).
		ballot: t.field({ type: BallotQuestionInput, required: false }),
	}),
})

const CastCallSelectionInput = builder.inputType("CastCallSelectionInput", {
	fields: (t) => ({
		optionId: t.id({ required: true }),
		conviction: t.int({ required: true }),
	}),
})

export const CastCallInput = builder.inputType("CastCallInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		caseText: t.string({ required: false }),

		// The numeric-guess shapes only - see NUMERIC_GUESS_SHAPES
		guessValue: t.float({ required: false }),
		conviction: t.int({ required: false }),

		// Every other shape: exactly 1, except player_season_award/
		// team_season_award (a question's picksRequired worth)
		selections: t.field({ type: [CastCallSelectionInput], required: false }),
	}),
})

export const CastCallPayload = builder
	.objectRef<{ call: Call }>("CastCallPayload")
	.implement({
		fields: (t) => ({
			call: t.field({ type: CallRef, resolve: (payload) => payload.call }),
		}),
	})

// Everything CastCallInput carries, keyed on the call being replaced rather
// than the question - the question is derived from the call server-side, so a
// redo can't be pointed at one call's id and another's question.
export const RedoCallInput = builder.inputType("RedoCallInput", {
	fields: (t) => ({
		callId: t.id({ required: true }),
		caseText: t.string({ required: false }),
		guessValue: t.float({ required: false }),
		conviction: t.int({ required: false }),
		selections: t.field({ type: [CastCallSelectionInput], required: false }),
	}),
})

export const RedoCallPayload = builder
	.objectRef<{ call: Call; redoBalance: number }>("RedoCallPayload")
	.implement({
		fields: (t) => ({
			call: t.field({ type: CallRef, resolve: (payload) => payload.call }),
			// Returned rather than left for a refetch: the redo button's own
			// label is the balance, and it has to be right the instant the
			// mutation comes back.
			redoBalance: t.exposeInt("redoBalance"),
		}),
	})

export const ResolveQuestionInput = builder.inputType("ResolveQuestionInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		// Every other shape: exactly 1. player_season_award/team_season_award:
		// the actual winners, not necessarily matching picksRequired
		correctOptionIds: t.field({ type: ["ID"], required: false }),
		// The numeric-guess shapes only - see NUMERIC_GUESS_SHAPES
		actualValue: t.float({ required: false }),
		resolutionNote: t.string({ required: false }),
	}),
})

export const FileDisputeInput = builder.inputType("FileDisputeInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		reason: t.string({ required: true }),
	}),
})

export const FileDisputePayload = builder
	.objectRef<{ dispute: typeof resolutionDisputes.$inferSelect }>(
		"FileDisputePayload",
	)
	.implement({
		fields: (t) => ({
			dispute: t.field({
				type: ResolutionDisputeRef,
				resolve: (payload) => payload.dispute,
			}),
		}),
	})

export const AdminResolveQuestionInput = builder.inputType(
	"AdminResolveQuestionInput",
	{
		fields: (t) => ({
			questionId: t.id({ required: true }),
			correctOptionIds: t.field({ type: ["ID"], required: false }),
			actualValue: t.float({ required: false }),
			resolutionNote: t.string({ required: false }),
			resolutionSource: t.string({ required: false }),
			resolutionSourceUrl: t.string({ required: false }),
		}),
	},
)

export const OverturnDisputeInput = builder.inputType("OverturnDisputeInput", {
	fields: (t) => ({
		disputeId: t.id({ required: true }),
		resolution: t.field({ type: AdminResolveQuestionInput, required: true }),
	}),
})

export const UpholdDisputeInput = builder.inputType("UpholdDisputeInput", {
	fields: (t) => ({
		disputeId: t.id({ required: true }),
		note: t.string({ required: false }),
	}),
})

export const EditQuestionTitleInput = builder.inputType(
	"EditQuestionTitleInput",
	{
		fields: (t) => ({
			questionId: t.id({ required: true }),
			title: t.string({ required: true }),
		}),
	},
)

export const VoidQuestionInput = builder.inputType("VoidQuestionInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		reason: t.field({ type: VoidReason, required: true }),
		duplicateOfQuestionId: t.id({ required: false }),
		note: t.string({ required: false }),
		countsAsStrike: t.boolean({ required: true }),
	}),
})

export const VoidQuestionPayload = builder
	.objectRef<{ questionId: string }>("VoidQuestionPayload")
	.implement({
		fields: (t) => ({
			questionId: t.exposeID("questionId"),
		}),
	})

export const AdminMarkQuestionVoidedInput = builder.inputType(
	"AdminMarkQuestionVoidedInput",
	{
		fields: (t) => ({
			questionId: t.id({ required: true }),
			reason: t.field({ type: QuestionVoidedReason, required: true }),
			note: t.string({ required: false }),
		}),
	},
)

export const DeleteQuestionInput = builder.inputType("DeleteQuestionInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
	}),
})

export const DeleteQuestionPayload = builder
	.objectRef<{ questionId: string }>("DeleteQuestionPayload")
	.implement({
		fields: (t) => ({
			questionId: t.exposeID("questionId"),
		}),
	})

export const ReportQuestionInput = builder.inputType("ReportQuestionInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		reason: t.field({ type: VoidReason, required: true }),
		details: t.string({ required: false }),
	}),
})

export const ReportQuestionPayload = builder
	.objectRef<{ report: typeof questionReports.$inferSelect }>(
		"ReportQuestionPayload",
	)
	.implement({
		fields: (t) => ({
			report: t.field({
				type: QuestionReportRef,
				resolve: (payload) => payload.report,
			}),
		}),
	})

export const DismissReportInput = builder.inputType("DismissReportInput", {
	fields: (t) => ({
		reportId: t.id({ required: true }),
	}),
})
