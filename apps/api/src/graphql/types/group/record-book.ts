import { formatWeekLabel } from "../../../lib/group-recap/week"
import {
	loadRecordBook,
	type RecordBookCallView,
	type RecordBookView,
	type RecordBookWeekView,
} from "../../../lib/group-record-book/load"
import { builder } from "../../builder"
import { UserRef } from "../user"
import { GroupRef } from "./refs"

type WeekPlayerView = RecordBookWeekView["players"][number]
type WeekScoreView = RecordBookView["mostPointsInAWeek"][number]
type CountView = RecordBookView["mostSweeps"][number]
type RunView = RecordBookView["mostConsecutivePlayerOfTheWeekAwards"][number]

const RecordBookWeekPlayerRef = builder
	.objectRef<WeekPlayerView>("RecordBookWeekPlayer")
	.implement({
		fields: (t) => ({
			// Null for a winner who has left the group or opted out of recaps.
			user: t.field({ type: UserRef, nullable: true, resolve: (p) => p.user }),
			points: t.exposeInt("points"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
		}),
	})

const RecordBookWeekRef = builder
	.objectRef<RecordBookWeekView>("RecordBookWeek")
	.implement({
		fields: (t) => ({
			weekKey: t.string({ resolve: (w) => w.week.key }),
			// "Oct 6 to 12".
			weekLabel: t.string({ resolve: (w) => formatWeekLabel(w.week) }),
			// False when too few members played that week for a recap.
			recapped: t.exposeBoolean("recapped"),
			// The recap's page token. Unlike GroupRecap.shareToken it's handed
			// over with links off too: the page still opens for members.
			shareToken: t.exposeString("shareToken", { nullable: true }),
			// Empty on a recapped week means nobody qualified.
			playersOfTheWeek: t.field({
				type: [RecordBookWeekPlayerRef],
				resolve: (w) => w.players,
			}),
		}),
	})

const RecordBookWeekScoreRef = builder
	.objectRef<WeekScoreView>("RecordBookWeekScore")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (s) => s.user }),
			points: t.exposeInt("points"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			weekKey: t.string({ resolve: (s) => s.week.key }),
			weekLabel: t.string({ resolve: (s) => formatWeekLabel(s.week) }),
		}),
	})

const RecordBookCallRef = builder
	.objectRef<RecordBookCallView>("RecordBookCall")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (c) => c.user }),
			points: t.exposeInt("points"),
			callId: t.exposeID("callId"),
			headline: t.exposeString("headline"),
			leagueAbbr: t.exposeString("leagueAbbr"),
			weekLabel: t.string({ resolve: (c) => formatWeekLabel(c.week) }),
		}),
	})

const RecordBookCountRef = builder
	.objectRef<CountView>("RecordBookCount")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (c) => c.user }),
			count: t.exposeInt("count"),
		}),
	})

const RecordBookRunRef = builder.objectRef<RunView>("RecordBookRun").implement({
	fields: (t) => ({
		user: t.field({ type: UserRef, resolve: (r) => r.user }),
		length: t.exposeInt("length"),
		// From the run's first week to its last: "Sep 29 to Oct 19".
		spanLabel: t.string({
			resolve: (r) =>
				formatWeekLabel({ start: r.first.start, end: r.last.end }),
		}),
	}),
})

const GroupRecordBookRef = builder
	.objectRef<RecordBookView>("GroupRecordBook")
	.implement({
		fields: (t) => ({
			// Every week from the group's first recap through its latest, newest
			// first.
			weeks: t.field({ type: [RecordBookWeekRef], resolve: (b) => b.weeks }),
			mostPointsInAWeek: t.field({
				type: [RecordBookWeekScoreRef],
				resolve: (b) => b.mostPointsInAWeek,
			}),
			mostPointsOnACall: t.field({
				type: [RecordBookCallRef],
				resolve: (b) => b.mostPointsOnACall,
			}),
			mostPlayerOfTheWeekAwards: t.field({
				type: [RecordBookCountRef],
				resolve: (b) => b.mostPlayerOfTheWeekAwards,
			}),
			mostConsecutivePlayerOfTheWeekAwards: t.field({
				type: [RecordBookRunRef],
				resolve: (b) => b.mostConsecutivePlayerOfTheWeekAwards,
			}),
			mostSweeps: t.field({
				type: [RecordBookCountRef],
				resolve: (b) => b.mostSweeps,
			}),
			mostPerfectCards: t.field({
				type: [RecordBookCountRef],
				resolve: (b) => b.mostPerfectCards,
			}),
		}),
	})

builder.objectFields(GroupRef, (t) => ({
	recordBook: t.field({
		type: GroupRecordBookRef,
		resolve: (group) => loadRecordBook(group),
	}),
}))
