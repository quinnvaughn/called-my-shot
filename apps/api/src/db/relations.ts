import { defineRelations } from "drizzle-orm"
import * as schema from "./schema"

export const relations = defineRelations(schema, (r) => ({
	users: {
		sessions: r.many.sessions(),
		groupsCreated: r.many.groups({
			from: r.users.id,
			to: r.groups.createdBy,
		}),
		groupMemberships: r.many.groupMembers(),
		questionsCreated: r.many.questions({
			from: r.users.id,
			to: r.questions.creatorId,
		}),
		calls: r.many.calls(),
		questionShares: r.many.questionShares(),
		disputesFiled: r.many.resolutionDisputes(),
	},
	sessions: {
		user: r.one.users({
			from: r.sessions.userId,
			to: r.users.id,
		}),
	},
	groups: {
		creator: r.one.users({
			from: r.groups.createdBy,
			to: r.users.id,
		}),
		members: r.many.groupMembers(),
		invites: r.many.groupInvites(),
		questionShares: r.many.questionShares(),
	},
	groupMembers: {
		group: r.one.groups({
			from: r.groupMembers.groupId,
			to: r.groups.id,
		}),
		user: r.one.users({
			from: r.groupMembers.userId,
			to: r.users.id,
		}),
	},
	groupInvites: {
		group: r.one.groups({
			from: r.groupInvites.groupId,
			to: r.groups.id,
		}),
		creator: r.one.users({
			from: r.groupInvites.createdBy,
			to: r.users.id,
		}),
	},
	questions: {
		creator: r.one.users({
			from: r.questions.creatorId,
			to: r.users.id,
		}),
		sport: r.one.sports({
			from: r.questions.sportId,
			to: r.sports.id,
		}),
		league: r.one.leagues({
			from: r.questions.leagueId,
			to: r.leagues.id,
		}),
		game: r.one.games({
			from: r.questions.gameId,
			to: r.games.id,
		}),
		stat: r.one.stats({
			from: r.questions.statId,
			to: r.stats.id,
		}),
		subjectTeam: r.one.teams({
			from: r.questions.subjectTeamId,
			to: r.teams.id,
		}),
		subjectPlayer: r.one.players({
			from: r.questions.subjectPlayerId,
			to: r.players.id,
		}),
		options: r.many.questionOptions(),
		calls: r.many.calls(),
		disputes: r.many.resolutionDisputes(),
		shares: r.many.questionShares(),
	},
	questionOptions: {
		question: r.one.questions({
			from: r.questionOptions.questionId,
			to: r.questions.id,
		}),
		team: r.one.teams({
			from: r.questionOptions.teamId,
			to: r.teams.id,
		}),
		player: r.one.players({
			from: r.questionOptions.playerId,
			to: r.players.id,
		}),
		selections: r.many.callSelections(),
	},
	sports: {
		leagues: r.many.leagues(),
		stats: r.many.stats(),
	},
	leagues: {
		sport: r.one.sports({
			from: r.leagues.sportId,
			to: r.sports.id,
		}),
		teams: r.many.teams(),
		games: r.many.games(),
	},
	teams: {
		league: r.one.leagues({
			from: r.teams.leagueId,
			to: r.leagues.id,
		}),
		players: r.many.players({
			from: r.teams.id,
			to: r.players.currentTeamId,
		}),
	},
	players: {
		currentTeam: r.one.teams({
			from: r.players.currentTeamId,
			to: r.teams.id,
		}),
	},
	games: {
		league: r.one.leagues({
			from: r.games.leagueId,
			to: r.leagues.id,
		}),
		homeTeam: r.one.teams({
			from: r.games.homeTeamId,
			to: r.teams.id,
		}),
		awayTeam: r.one.teams({
			from: r.games.awayTeamId,
			to: r.teams.id,
		}),
		questions: r.many.questions(),
	},
	stats: {
		sport: r.one.sports({
			from: r.stats.sportId,
			to: r.sports.id,
		}),
		toleranceTier: r.one.statToleranceTiers({
			from: r.stats.toleranceTierId,
			to: r.statToleranceTiers.id,
		}),
	},
	statToleranceTiers: {
		stats: r.many.stats(),
	},
	calls: {
		question: r.one.questions({
			from: r.calls.questionId,
			to: r.questions.id,
		}),
		user: r.one.users({
			from: r.calls.userId,
			to: r.users.id,
		}),
		selections: r.many.callSelections(),
	},
	callSelections: {
		call: r.one.calls({
			from: r.callSelections.callId,
			to: r.calls.id,
		}),
		option: r.one.questionOptions({
			from: r.callSelections.optionId,
			to: r.questionOptions.id,
		}),
	},
	resolutionDisputes: {
		question: r.one.questions({
			from: r.resolutionDisputes.questionId,
			to: r.questions.id,
		}),
		user: r.one.users({
			from: r.resolutionDisputes.userId,
			to: r.users.id,
		}),
	},
	questionShares: {
		group: r.one.groups({
			from: r.questionShares.groupId,
			to: r.groups.id,
		}),
		question: r.one.questions({
			from: r.questionShares.questionId,
			to: r.questions.id,
		}),
		sharedByUser: r.one.users({
			from: r.questionShares.sharedBy,
			to: r.users.id,
		}),
	},
}))
