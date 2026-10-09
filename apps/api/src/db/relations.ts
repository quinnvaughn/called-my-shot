import { defineRelations } from "drizzle-orm"
import * as schema from "./schema"

export const relations = defineRelations(schema, (r) => ({
	users: {
		sessions: r.many.sessions(),
		pendingEmailChange: r.one.pendingEmailChanges(),
		groupsCreated: r.many.groups({
			from: r.users.id,
			to: r.groups.createdBy,
		}),
		groupMemberships: r.many.groupMembers({
			from: r.users.id,
			to: r.groupMembers.userId,
		}),
		questionsCreated: r.many.questions({
			from: r.users.id,
			to: r.questions.creatorId,
		}),
		calls: r.many.calls(),
		referralCode: r.one.referralCodes(),
		// Who this user brought in.
		referralsMade: r.many.referrals({
			from: r.users.id,
			to: r.referrals.referrerId,
		}),
		// Who brought this user in. At most one, and it never changes.
		referral: r.one.referrals({
			from: r.users.id,
			to: r.referrals.inviteeId,
		}),
		redoGrants: r.many.redoGrants(),
		questionShares: r.many.questionShares(),
		disputesFiled: r.many.resolutionDisputes(),
		supportTickets: r.many.supportTickets(),
		voidsReceived: r.many.questionVoids({
			from: r.users.id,
			to: r.questionVoids.targetUserId,
		}),
		voidsIssued: r.many.questionVoids({
			from: r.users.id,
			to: r.questionVoids.voidedByAdminId,
		}),
		reportsFiled: r.many.questionReports(),
		notifications: r.many.notifications({
			from: r.users.id,
			to: r.notifications.userId,
		}),
		equippedFlair: r.one.flairs({
			from: r.users.equippedFlairId,
			to: r.flairs.id,
		}),
		// Only the flairs this user was GIVEN. Not what they can equip: every
		// "open" flair is equippable without a row here (see flairs.unlock), so
		// the picker's list comes from lib/flairs/available.ts instead.
		flairGrants: r.many.userFlairs({
			from: r.users.id,
			to: r.userFlairs.userId,
		}),
	},
	flairs: {
		// Non-null only on a team flair, and the source of its label, icon and
		// color - those columns are null on the flair row itself.
		team: r.one.teams({
			from: r.flairs.teamId,
			to: r.teams.id,
		}),
		scopeGroup: r.one.groups({
			from: r.flairs.scopeGroupId,
			to: r.groups.id,
		}),
		grants: r.many.userFlairs({
			from: r.flairs.id,
			to: r.userFlairs.flairId,
		}),
	},
	userFlairs: {
		flair: r.one.flairs({
			from: r.userFlairs.flairId,
			to: r.flairs.id,
		}),
		// Two relations onto users, so each needs an explicit from/to - same
		// reason as voidsReceived/voidsIssued above.
		user: r.one.users({
			from: r.userFlairs.userId,
			to: r.users.id,
		}),
		grantedBy: r.one.users({
			from: r.userFlairs.grantedByUserId,
			to: r.users.id,
		}),
	},
	sessions: {
		user: r.one.users({
			from: r.sessions.userId,
			to: r.users.id,
		}),
	},
	oauthAccounts: {
		user: r.one.users({
			from: r.oauthAccounts.userId,
			to: r.users.id,
		}),
	},
	pendingEmailChanges: {
		user: r.one.users({
			from: r.pendingEmailChanges.userId,
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
		trackedLeagues: r.many.groupLeagues(),
		links: r.many.groupLinks(),
		pins: r.many.groupPins(),
		ballots: r.many.groupBallots(),
	},
	groupLinks: {
		group: r.one.groups({
			from: r.groupLinks.groupId,
			to: r.groups.id,
		}),
	},
	groupLeagues: {
		group: r.one.groups({
			from: r.groupLeagues.groupId,
			to: r.groups.id,
		}),
		league: r.one.leagues({
			from: r.groupLeagues.leagueId,
			to: r.leagues.id,
		}),
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
		// This member's in-group override. Null on every row today - nothing
		// writes groupMembers.equippedFlairId yet.
		equippedFlair: r.one.flairs({
			from: r.groupMembers.equippedFlairId,
			to: r.flairs.id,
		}),
		invitedBy: r.one.users({
			from: r.groupMembers.invitedById,
			to: r.users.id,
		}),
	},
	groupPins: {
		group: r.one.groups({
			from: r.groupPins.groupId,
			to: r.groups.id,
		}),
		question: r.one.questions({
			from: r.groupPins.questionId,
			to: r.questions.id,
		}),
		pinnedByUser: r.one.users({
			from: r.groupPins.pinnedBy,
			to: r.users.id,
		}),
	},
	groupBallots: {
		group: r.one.groups({
			from: r.groupBallots.groupId,
			to: r.groups.id,
		}),
		ballot: r.one.ballots({
			from: r.groupBallots.ballotId,
			to: r.ballots.id,
		}),
		addedByUser: r.one.users({
			from: r.groupBallots.addedBy,
			to: r.users.id,
		}),
	},
	groupEvents: {
		group: r.one.groups({
			from: r.groupEvents.groupId,
			to: r.groups.id,
		}),
		actor: r.one.users({
			from: r.groupEvents.actorId,
			to: r.users.id,
		}),
		invitedBy: r.one.users({
			from: r.groupEvents.invitedById,
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
		series: r.one.postseasonSeries({
			from: r.questions.seriesId,
			to: r.postseasonSeries.id,
		}),
		season: r.one.seasons({
			from: r.questions.seasonId,
			to: r.seasons.id,
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
		reports: r.many.questionReports(),
		shares: r.many.questionShares(),
		ballotMembership: r.one.ballotQuestions({
			from: r.questions.id,
			to: r.ballotQuestions.questionId,
		}),
		autoResolution: r.one.questionAutoResolutions({
			from: r.questions.id,
			to: r.questionAutoResolutions.questionId,
		}),
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
		seasons: r.many.seasons(),
		playerGameStats: r.many.playerGameStats(),
		teamGameStats: r.many.teamGameStats(),
	},
	seasons: {
		league: r.one.leagues({
			from: r.seasons.leagueId,
			to: r.leagues.id,
		}),
		games: r.many.games(),
		weeks: r.many.seasonWeeks(),
		playerGameStats: r.many.playerGameStats(),
		teamGameStats: r.many.teamGameStats(),
	},
	postseasonSeries: {
		games: r.many.games(),
		questions: r.many.questions(),
	},
	seasonWeeks: {
		season: r.one.seasons({
			from: r.seasonWeeks.seasonId,
			to: r.seasons.id,
		}),
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
		records: r.many.teamRecords(),
		// Rows a team's own players put up, and rows their opponents put up
		// against them - the second is what opponent-allowed numbers read.
		gameStats: r.many.playerGameStats({
			from: r.teams.id,
			to: r.playerGameStats.teamId,
			alias: "player_game_stat_team",
		}),
		gameStatsAllowed: r.many.playerGameStats({
			from: r.teams.id,
			to: r.playerGameStats.opponentTeamId,
			alias: "player_game_stat_opponent",
		}),
		teamGameStats: r.many.teamGameStats({
			from: r.teams.id,
			to: r.teamGameStats.teamId,
			alias: "team_game_stat_team",
		}),
		teamGameStatsAllowed: r.many.teamGameStats({
			from: r.teams.id,
			to: r.teamGameStats.opponentTeamId,
			alias: "team_game_stat_opponent",
		}),
	},
	teamRecords: {
		team: r.one.teams({
			from: r.teamRecords.teamId,
			to: r.teams.id,
		}),
		season: r.one.seasons({
			from: r.teamRecords.seasonId,
			to: r.seasons.id,
		}),
	},
	players: {
		currentTeam: r.one.teams({
			from: r.players.currentTeamId,
			to: r.teams.id,
		}),
		gameStats: r.many.playerGameStats(),
	},
	games: {
		league: r.one.leagues({
			from: r.games.leagueId,
			to: r.leagues.id,
		}),
		season: r.one.seasons({
			from: r.games.seasonId,
			to: r.seasons.id,
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
		series: r.one.postseasonSeries({
			from: r.games.seriesId,
			to: r.postseasonSeries.id,
		}),
		starters: r.many.gameStarters(),
		playerStats: r.many.playerGameStats(),
		teamStats: r.many.teamGameStats(),
	},
	playerGameStats: {
		game: r.one.games({
			from: r.playerGameStats.gameId,
			to: r.games.id,
		}),
		player: r.one.players({
			from: r.playerGameStats.playerId,
			to: r.players.id,
		}),
		// Two FKs onto teams, so both sides need explicit from/to and an alias.
		team: r.one.teams({
			from: r.playerGameStats.teamId,
			to: r.teams.id,
			alias: "player_game_stat_team",
		}),
		opponentTeam: r.one.teams({
			from: r.playerGameStats.opponentTeamId,
			to: r.teams.id,
			alias: "player_game_stat_opponent",
		}),
		season: r.one.seasons({
			from: r.playerGameStats.seasonId,
			to: r.seasons.id,
		}),
		league: r.one.leagues({
			from: r.playerGameStats.leagueId,
			to: r.leagues.id,
		}),
	},
	teamGameStats: {
		game: r.one.games({
			from: r.teamGameStats.gameId,
			to: r.games.id,
		}),
		team: r.one.teams({
			from: r.teamGameStats.teamId,
			to: r.teams.id,
			alias: "team_game_stat_team",
		}),
		opponentTeam: r.one.teams({
			from: r.teamGameStats.opponentTeamId,
			to: r.teams.id,
			alias: "team_game_stat_opponent",
		}),
		season: r.one.seasons({
			from: r.teamGameStats.seasonId,
			to: r.seasons.id,
		}),
		league: r.one.leagues({
			from: r.teamGameStats.leagueId,
			to: r.leagues.id,
		}),
	},
	gameStarters: {
		game: r.one.games({
			from: r.gameStarters.gameId,
			to: r.games.id,
		}),
		team: r.one.teams({
			from: r.gameStarters.teamId,
			to: r.teams.id,
		}),
		player: r.one.players({
			from: r.gameStarters.playerId,
			to: r.players.id,
		}),
	},
	stats: {
		sport: r.one.sports({
			from: r.stats.sportId,
			to: r.sports.id,
		}),
		toleranceTier: r.one.statToleranceTiers({
			from: r.stats.toleranceTierId,
			to: r.statToleranceTiers.id,
			alias: "tolerance_tier",
		}),
		teamToleranceTier: r.one.statToleranceTiers({
			from: r.stats.teamToleranceTierId,
			to: r.statToleranceTiers.id,
			alias: "team_tolerance_tier",
		}),
	},
	statToleranceTiers: {
		stats: r.many.stats({ alias: "tolerance_tier" }),
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
		// Null on almost every call. Its presence is the badge signal.
		redo: r.one.callRedos({
			from: r.calls.id,
			to: r.callRedos.callId,
		}),
	},
	callFades: {
		faderCall: r.one.calls({
			from: r.callFades.faderCallId,
			to: r.calls.id,
		}),
		targetCall: r.one.calls({
			from: r.callFades.targetCallId,
			to: r.calls.id,
		}),
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
	callRedos: {
		call: r.one.calls({
			from: r.callRedos.callId,
			to: r.calls.id,
		}),
		grant: r.one.redoGrants({
			from: r.callRedos.grantId,
			to: r.redoGrants.id,
		}),
		selections: r.many.callRedoSelections(),
	},
	callRedoSelections: {
		redo: r.one.callRedos({
			from: r.callRedoSelections.redoId,
			to: r.callRedos.id,
		}),
		option: r.one.questionOptions({
			from: r.callRedoSelections.optionId,
			to: r.questionOptions.id,
		}),
	},
	referralCodes: {
		user: r.one.users({
			from: r.referralCodes.userId,
			to: r.users.id,
		}),
	},
	referrals: {
		referrer: r.one.users({
			from: r.referrals.referrerId,
			to: r.users.id,
		}),
		invitee: r.one.users({
			from: r.referrals.inviteeId,
			to: r.users.id,
		}),
		firstCall: r.one.calls({
			from: r.referrals.firstCallId,
			to: r.calls.id,
		}),
		season: r.one.seasons({
			from: r.referrals.seasonId,
			to: r.seasons.id,
		}),
	},
	redoGrants: {
		user: r.one.users({
			from: r.redoGrants.userId,
			to: r.users.id,
		}),
		referral: r.one.referrals({
			from: r.redoGrants.referralId,
			to: r.referrals.id,
		}),
		consumedByCall: r.one.calls({
			from: r.redoGrants.consumedByCallId,
			to: r.calls.id,
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
	ballots: {
		sport: r.one.sports({
			from: r.ballots.sportId,
			to: r.sports.id,
		}),
		league: r.one.leagues({
			from: r.ballots.leagueId,
			to: r.leagues.id,
		}),
		season: r.one.seasons({
			from: r.ballots.seasonId,
			to: r.seasons.id,
		}),
		creator: r.one.users({
			from: r.ballots.createdBy,
			to: r.users.id,
		}),
		members: r.many.ballotQuestions(),
	},
	ballotQuestions: {
		ballot: r.one.ballots({
			from: r.ballotQuestions.ballotId,
			to: r.ballots.id,
		}),
		question: r.one.questions({
			from: r.ballotQuestions.questionId,
			to: r.questions.id,
		}),
	},
	supportTickets: {
		user: r.one.users({
			from: r.supportTickets.userId,
			to: r.users.id,
		}),
	},
	questionVoids: {
		targetUser: r.one.users({
			from: r.questionVoids.targetUserId,
			to: r.users.id,
		}),
		voidedByAdmin: r.one.users({
			from: r.questionVoids.voidedByAdminId,
			to: r.users.id,
		}),
		duplicateOfQuestion: r.one.questions({
			from: r.questionVoids.duplicateOfQuestionId,
			to: r.questions.id,
		}),
	},
	questionReports: {
		question: r.one.questions({
			from: r.questionReports.questionId,
			to: r.questions.id,
		}),
		reportedBy: r.one.users({
			from: r.questionReports.reportedByUserId,
			to: r.users.id,
		}),
	},
	notifications: {
		user: r.one.users({
			from: r.notifications.userId,
			to: r.users.id,
		}),
		actor: r.one.users({
			from: r.notifications.actorId,
			to: r.users.id,
		}),
		question: r.one.questions({
			from: r.notifications.questionId,
			to: r.questions.id,
		}),
		group: r.one.groups({
			from: r.notifications.groupId,
			to: r.groups.id,
		}),
		dispute: r.one.resolutionDisputes({
			from: r.notifications.disputeId,
			to: r.resolutionDisputes.id,
		}),
		league: r.one.leagues({
			from: r.notifications.leagueId,
			to: r.leagues.id,
		}),
		call: r.one.calls({
			from: r.notifications.callId,
			to: r.calls.id,
		}),
	},
	achievementNotices: {
		user: r.one.users({
			from: r.achievementNotices.userId,
			to: r.users.id,
		}),
		notification: r.one.notifications({
			from: r.achievementNotices.notificationId,
			to: r.notifications.id,
		}),
	},
	userStreaks: {
		user: r.one.users({
			from: r.userStreaks.userId,
			to: r.users.id,
		}),
		league: r.one.leagues({
			from: r.userStreaks.leagueId,
			to: r.leagues.id,
		}),
	},
	callStreakPositions: {
		call: r.one.calls({
			from: r.callStreakPositions.callId,
			to: r.calls.id,
		}),
	},
	userSweeps: {
		user: r.one.users({
			from: r.userSweeps.userId,
			to: r.users.id,
		}),
		league: r.one.leagues({
			from: r.userSweeps.leagueId,
			to: r.leagues.id,
		}),
		season: r.one.seasons({
			from: r.userSweeps.seasonId,
			to: r.seasons.id,
		}),
	},
}))
