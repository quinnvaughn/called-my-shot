import type {
	RecordCalendar,
	RecordDay,
	RecordDayLeague,
	RecordLeagueRow,
	RecordTeamRow,
	UserRecord,
	UserRecordInputs,
} from "../../../lib/user-record"
import { loadUserRecordInputs } from "../../../lib/user-record"
import { builder } from "../../builder"
import { type Context, ctxCache } from "../../context"
import {
	LeagueRef,
	ReportCardFamilyRowRef,
	ReportCardShapeRowRef,
	TeamRef,
} from "../sports"

// Every call a user has made, loaded once per request no matter how many
// scoped records or league stats ask for it.
export function getUserRecordInputs(
	ctx: Context,
	userId: string,
): Promise<UserRecordInputs> {
	return ctxCache(ctx, `userRecordInputs:${userId}`, () =>
		loadUserRecordInputs(userId),
	)
}

const RecordDayLeagueRef = builder
	.objectRef<RecordDayLeague>("RecordDayLeague")
	.implement({
		fields: (t) => ({
			league: t.field({ type: LeagueRef, resolve: (r) => r.league }),
			// The report card this day's calls in this league land on. Null for
			// a day made only of calls on no single game.
			windowKey: t.exposeString("windowKey", { nullable: true }),
			settledCount: t.exposeInt("settledCount"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			pendingCount: t.exposeInt("pendingCount"),
			netPoints: t.exposeInt("netPoints"),
		}),
	})

const RecordDayRef = builder.objectRef<RecordDay>("RecordDay").implement({
	fields: (t) => ({
		// ISO date, ET.
		day: t.exposeString("day"),
		settledCount: t.exposeInt("settledCount"),
		wins: t.exposeInt("wins"),
		losses: t.exposeInt("losses"),
		pendingCount: t.exposeInt("pendingCount"),
		netPoints: t.exposeInt("netPoints"),
		// Unrounded, like ReportCard.returnPct. Null until something settles.
		returnPct: t.exposeFloat("returnPct", { nullable: true }),
		grade: t.string({ nullable: true, resolve: (r) => r.grade }),
		leagues: t.field({
			type: [RecordDayLeagueRef],
			resolve: (r) => r.leagues,
		}),
	}),
})

const RecordCalendarRef = builder
	.objectRef<RecordCalendar>("RecordCalendar")
	.implement({
		fields: (t) => ({
			startDay: t.exposeString("startDay"),
			endDay: t.exposeString("endDay"),
			// The earliest day with a call in scope, on any page. Null with no
			// dated calls.
			firstDay: t.exposeString("firstDay", { nullable: true }),
			activeDays: t.exposeInt("activeDays"),
			callCount: t.exposeInt("callCount"),
			days: t.field({ type: [RecordDayRef], resolve: (r) => r.days }),
		}),
	})

const RecordLeagueRowRef = builder
	.objectRef<RecordLeagueRow>("RecordLeagueRow")
	.implement({
		fields: (t) => ({
			league: t.field({ type: LeagueRef, resolve: (r) => r.league }),
			settledCount: t.exposeInt("settledCount"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			netPoints: t.exposeInt("netPoints"),
			committedPoints: t.exposeInt("committedPoints"),
			returnPct: t.exposeFloat("returnPct", { nullable: true }),
		}),
	})

const RecordTeamRowRef = builder
	.objectRef<RecordTeamRow>("RecordTeamRow")
	.implement({
		fields: (t) => ({
			// Null for the row of calls about no single team: game totals,
			// subject-less props, picks from more than one roster.
			team: t.field({
				type: TeamRef,
				nullable: true,
				resolve: (r) => r.team,
			}),
			settledCount: t.exposeInt("settledCount"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			netPoints: t.exposeInt("netPoints"),
			committedPoints: t.exposeInt("committedPoints"),
			returnPct: t.exposeFloat("returnPct", { nullable: true }),
		}),
	})

export const UserRecordRef = builder
	.objectRef<UserRecord>("UserRecord")
	.implement({
		fields: (t) => ({
			calendar: t.field({
				type: RecordCalendarRef,
				resolve: (r) => r.calendar,
			}),
			// Empty when the record is scoped to one league.
			byLeague: t.field({
				type: [RecordLeagueRowRef],
				resolve: (r) => r.byLeague,
			}),
			byFamily: t.field({
				type: [ReportCardFamilyRowRef],
				resolve: (r) => r.byFamily,
			}),
			byShape: t.field({
				type: [ReportCardShapeRowRef],
				resolve: (r) => r.byShape,
			}),
			byTeam: t.field({
				type: [RecordTeamRowRef],
				resolve: (r) => r.byTeam,
			}),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			// Net over committed across every settled call in scope, unrounded.
			returnPct: t.exposeFloat("returnPct", { nullable: true }),
			// What the settled calls in scope netted. Plus bonusPoints, this is
			// the scope's point total.
			netFromCalls: t.exposeInt("netFromCalls"),
			// Streak milestones and sweeps, which no single call earned.
			bonusPoints: t.exposeInt("bonusPoints"),
		}),
	})
