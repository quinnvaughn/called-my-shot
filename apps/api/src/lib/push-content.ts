import {
	type AchievementKind,
	achievementText,
	gamePath,
	questionPath,
} from "@called-my-shot/schemas"
import { match } from "ts-pattern"
import { db } from "../db"
import type { Notification } from "../db/schema"
import { loadGameEntry } from "./game-entry"

// What a push says and where tapping it goes, minus the tag. Null when what
// it was about is gone (a deleted question, a game no longer there), in which
// case nothing is sent.
export type PushContent = { title: string; body: string; path: string }

const quoted = (title: string | null) => (title ? `"${title}"` : "a question")

function signedPoints(points: number): string {
	return `${points > 0 ? "+" : ""}${points} pts`
}

async function loadGame(gameId: string) {
	const game = await db.query.games.findFirst({
		where: { id: gameId },
		columns: { id: true, startsAt: true },
		with: {
			league: { columns: { slug: true } },
			homeTeam: { columns: { name: true, abbreviation: true } },
			awayTeam: { columns: { name: true, abbreviation: true } },
		},
	})
	if (!game?.league || !game.homeTeam || !game.awayTeam) return null
	const { league, homeTeam, awayTeam } = game
	return {
		...game,
		league,
		homeTeam,
		awayTeam,
		matchup: `${awayTeam.abbreviation} @ ${homeTeam.abbreviation}`,
	}
}

async function loadUsername(userId: string): Promise<string | null> {
	const user = await db.query.users.findFirst({
		where: { id: userId },
		columns: { username: true },
	})
	return user?.username ?? null
}

async function questionTarget(questionId: string | null) {
	if (!questionId) return null
	const question = await db.query.questions.findFirst({
		where: { id: questionId },
		columns: { id: true, title: true },
	})
	return question ? questionPath(question) : null
}

async function challengeCode(challengeId: string | null) {
	if (!challengeId) return null
	const challenge = await db.query.challenges.findFirst({
		where: { id: challengeId },
		columns: { code: true, creatorId: true },
		with: {
			creator: { columns: { username: true } },
			acceptances: { columns: { id: true } },
		},
	})
	return challenge ?? null
}

async function presserTarget(presserId: string | null) {
	if (!presserId) return null
	const presser = await db.query.pressers.findFirst({
		where: { id: presserId },
		columns: { gameId: true },
		with: { user: { columns: { username: true } } },
	})
	if (!presser?.user) return null
	const game = await loadGame(presser.gameId)
	return {
		path: `/games/${presser.gameId}/picks/${presser.user.username}`,
		matchup: game?.matchup ?? null,
	}
}

async function achievement(n: Notification, kind: AchievementKind) {
	const league = n.leagueId
		? await db.query.leagues.findFirst({
				where: { id: n.leagueId },
				columns: { slug: true },
			})
		: null
	const username = await loadUsername(n.userId)
	if (!league || !username) return null
	const body = achievementText({
		kind,
		label: n.achievementLabel ?? "",
		count: n.achievementCount ?? 0,
		previousBest: n.previousBest,
	})
	const path = match(kind)
		.with("sweep_completed", () =>
			n.slateKey
				? `/user/${username}/sweeps/${league.slug}/${n.slateKey}`
				: null,
		)
		.otherwise(() =>
			n.streakFamily
				? `/user/${username}/streaks/${league.slug}/${n.streakFamily}/hot`
				: null,
		)
	if (!path) return null
	return {
		title: match(kind)
			.with("sweep_completed", () => "Sweep")
			.with("streak_snapped", () => "Streak over")
			.otherwise(() => "Streak"),
		body,
		path,
	}
}

// Every pushed notification type, told the way its in-app row tells it
// (apps/web/src/components/notifications/rows) and opening the page that row
// opens. Read at send time, so a game's results push counts every call that
// settled during its hold.
export async function buildPushContent(
	n: Notification,
): Promise<PushContent | null> {
	return match(n.type)
		.with("game_resolved", async () => {
			if (!n.gameId) return null
			const [game, entry, username, presser] = await Promise.all([
				loadGame(n.gameId),
				loadGameEntry(n.gameId, n.userId),
				loadUsername(n.userId),
				db.query.pressers.findFirst({
					where: { gameId: n.gameId, userId: n.userId },
					columns: { closesAt: true },
				}),
			])
			if (!game || !entry || !username) return null
			const settled = entry.wins + entry.losses
			const record =
				settled === 0
					? "Your calls settled."
					: settled === 1
						? `Your call ${entry.wins ? "hit" : "missed"}. ${signedPoints(entry.points)}.`
						: `${entry.wins} of ${settled} calls hit. ${signedPoints(entry.points)}.`
			const presserOpen = presser && presser.closesAt > new Date()
			return {
				title: game.matchup,
				body: presserOpen ? `${record} Your presser is open.` : record,
				path: `/games/${game.id}/picks/${username}`,
			}
		})
		.with("call_resolved", async () => {
			const path = n.callId
				? `/calls/${n.callId}`
				: await questionTarget(n.questionId)
			if (!path) return null
			const hit = (n.pointsDelta ?? 0) >= 0
			return {
				title: hit ? "Your call hit" : "Your call missed",
				body:
					n.pointsDelta === null
						? quoted(n.questionTitle)
						: `${quoted(n.questionTitle)}. ${signedPoints(n.pointsDelta)}.`,
				path,
			}
		})
		.with("call_faded", "fade_gloated", async (type) => {
			if (!n.callId) return null
			return {
				title: `@${n.actorUsername}`,
				body:
					type === "call_faded"
						? `Faded your call on ${quoted(n.questionTitle)}`
						: `Gloated on ${quoted(n.questionTitle)}`,
				path: `/calls/${n.callId}`,
			}
		})
		.with(
			"dispute_filed",
			"dispute_upheld",
			"dispute_overturned",
			"question_voided",
			"call_voided",
			async (type) => {
				const body = match(type)
					.with(
						"dispute_filed",
						() =>
							`@${n.actorUsername} disputed your resolution on ${quoted(n.questionTitle)}`,
					)
					.with(
						"dispute_upheld",
						() => `Your dispute on ${quoted(n.questionTitle)} was upheld`,
					)
					.with(
						"dispute_overturned",
						() => `Your dispute on ${quoted(n.questionTitle)} was overturned`,
					)
					.with("question_voided", () =>
						n.strikeCount === null
							? `Your question ${quoted(n.questionTitle)} was voided`
							: `Your question ${quoted(n.questionTitle)} was voided (strike ${n.strikeCount})`,
					)
					.with(
						"call_voided",
						() =>
							`${quoted(n.questionTitle)} was voided, so your call on it doesn't score`,
					)
					.exhaustive()
				// A voided question is deleted, so its push opens the inbox.
				const path = (await questionTarget(n.questionId)) ?? "/notifications"
				return { title: "Called My Shot", body, path }
			},
		)
		.with("group_member_joined", "question_shared_to_group", async (type) => {
			if (!n.groupId) return null
			return {
				title: n.groupName ?? "Your group",
				body:
					type === "group_member_joined"
						? `@${n.actorUsername} joined`
						: `@${n.actorUsername} shared ${quoted(n.questionTitle)}`,
				path: `/groups/${n.groupId}`,
			}
		})
		.with(
			"sweep_completed",
			"streak_milestone",
			"streak_personal_best",
			"streak_snapped",
			(kind) => achievement(n, kind),
		)
		.with("redo_earned", async () => ({
			title: "You earned a redo",
			body: `@${n.actorUsername} made their first call.`,
			path: "/invite",
		}))
		.with("presser_question_received", "presser_answered", async (type) => {
			const presser = await presserTarget(n.presserId)
			if (!presser) return null
			const at = presser.matchup ? ` at your ${presser.matchup} presser` : ""
			return {
				title: presser.matchup ? `${presser.matchup} presser` : "Presser",
				body:
					type === "presser_question_received"
						? `@${n.actorUsername} asked a question${at}`
						: `@${n.actorUsername} answered your question`,
				path: presser.path,
			}
		})
		.with(
			"challenge_accepted",
			"challenge_settled",
			"challenge_gloated",
			"challenge_posted_to_group",
			async (type) => {
				const challenge = await challengeCode(n.challengeId)
				if (!challenge) return null
				const path = `/challenges/${challenge.code}`
				return match(type)
					.with("challenge_accepted", () => {
						const others = challenge.acceptances.length - 1
						return {
							title: "Challenge accepted",
							body:
								others > 0
									? `@${n.actorUsername} and ${others} ${others === 1 ? "other" : "others"} took on your challenge`
									: `@${n.actorUsername} took on your challenge`,
							path,
						}
					})
					.with("challenge_settled", () => ({
						title: "Challenge final",
						body:
							challenge.creatorId === n.userId
								? "Every question in your challenge has a result. See how everyone did."
								: `Your 1v1 with @${challenge.creator?.username} is final. See how it went.`,
						path,
					}))
					.with("challenge_gloated", () => ({
						title: "Challenge",
						body: `@${n.actorUsername} beat you and talked trash`,
						path,
					}))
					.with("challenge_posted_to_group", () => ({
						title: n.groupName ?? "Your group",
						body: `@${n.actorUsername} posted a challenge`,
						path,
					}))
					.exhaustive()
			},
		)
		.with("game_reminder", async () => {
			if (!n.gameId) return null
			const game = await loadGame(n.gameId)
			if (!game) return null
			return {
				title: `${game.matchup} starts soon`,
				body: "Check who's starting before calls lock.",
				path: gamePath(game),
			}
		})
		.with("group_pins_expired", async () => {
			if (!n.groupId) return null
			return {
				title: n.groupName ?? "Your group",
				body: "Your pinned questions locked. Pin another to keep one at the top of the group page.",
				path: `/groups/${n.groupId}`,
			}
		})
		.exhaustive()
}
