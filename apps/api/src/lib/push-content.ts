import {
	type AchievementKind,
	achievementText,
	gamePath,
	questionPath,
} from "@called-my-shot/schemas"
import { match } from "ts-pattern"
import { db } from "../db"
import type { Notification } from "../db/schema"
import {
	chainLinesFor,
	chainPath,
	lastCommenter,
	linkWasApproved,
	loadChainForPush,
	pendingRequestCount,
} from "./chains/push"
import { loadGameEntry } from "./game-entry"
import {
	lastPostCommenter,
	lastReplier,
	loadPostForPush,
	postPath,
} from "./posts/push"

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

// A game's results for one person, with any chain the game settled for them
// after: "2 of 3 calls hit. +210 pts. @dave broke the chain." Null when they
// had no calls on it.
async function gameResultsPush(
	gameId: string,
	userId: string,
): Promise<PushContent | null> {
	const [game, entry, username, presser, chainLines] = await Promise.all([
		loadGame(gameId),
		loadGameEntry(gameId, userId),
		loadUsername(userId),
		db.query.pressers.findFirst({
			where: { gameId, userId },
			columns: { closesAt: true },
		}),
		chainLinesFor(gameId, userId),
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
		body: [
			record,
			...chainLines,
			...(presserOpen ? ["Your presser is open."] : []),
		].join(" "),
		path: `/games/${game.id}/picks/${username}`,
	}
}

// Every pushed notification type, told the way its in-app row tells it
// (apps/web/src/components/notifications/rows) and opening the page that row
// opens. Read at send time, so a game's results push counts every call that
// settled during its hold. user_followed and likes_milestone are never
// queued (see PUSH_POLICY) but are told the same way, so every type has an
// answer.
export async function buildPushContent(
	n: Notification,
): Promise<PushContent | null> {
	return match(n.type)
		.with("game_resolved", async () =>
			n.gameId ? gameResultsPush(n.gameId, n.userId) : null,
		)
		.with("chain_settled", async () => {
			if (!n.gameId) return null
			// Whichever of this and the game's own results push the outbox row
			// ended up as, it says the same thing.
			const combined = await gameResultsPush(n.gameId, n.userId)
			if (combined) return combined
			const chain = await loadChainForPush(n.chainId)
			const lines = await chainLinesFor(n.gameId, n.userId)
			if (!chain || lines.length === 0) return null
			return {
				title: n.groupName ?? "Your chain",
				body: lines.join(" "),
				path: chainPath(chain),
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
		.with(
			"chain_link_requested",
			"chain_link_decided",
			"chain_member_left",
			"chain_called_off",
			"chain_commented",
			async (type) => {
				const chain = await loadChainForPush(n.chainId)
				if (!chain) return null
				const title = n.groupName ?? "Your chain"
				const path = chainPath(chain)
				const body = await match(type)
					.with("chain_link_requested", async () => {
						const others = (await pendingRequestCount(chain.id)) - 1
						return others > 0
							? `@${n.actorUsername} and ${others} ${others === 1 ? "other" : "others"} want in on your chain`
							: `@${n.actorUsername} wants in on your chain`
					})
					.with("chain_link_decided", async () => {
						const approved = await linkWasApproved(chain.id, n.userId)
						if (approved === null) return null
						return approved
							? `@${n.actorUsername} added your link to the chain`
							: `@${n.actorUsername} turned down your link`
					})
					.with(
						"chain_member_left",
						async () => `@${n.actorUsername} left your chain`,
					)
					.with(
						"chain_called_off",
						async () => `@${n.actorUsername} called off the chain`,
					)
					.with("chain_commented", async () => {
						const username =
							(await lastCommenter(chain.id, n.userId)) ?? n.actorUsername
						return `@${username} posted in the chain`
					})
					.exhaustive()
				return body ? { title, body, path } : null
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
		.with("post_commented", async () => {
			const post = await loadPostForPush(n.postId)
			if (!post) return null
			const username =
				(await lastPostCommenter(post.id, n.userId)) ?? n.actorUsername
			return {
				title: post.promptTitle,
				body: `@${username} commented on your ${post.noun}`,
				path: postPath(post.id),
			}
		})
		.with("comment_replied", async () => {
			const post = await loadPostForPush(n.postId)
			if (!post || !n.commentId) return null
			const parent = await db.query.comments.findFirst({
				where: { id: n.commentId },
				columns: { senderId: true },
			})
			if (!parent) return null
			const username =
				(await lastReplier(n.commentId, n.userId)) ?? n.actorUsername
			return {
				title: post.promptTitle,
				body:
					parent.senderId === n.userId
						? `@${username} replied to your comment`
						: `@${username} replied to you`,
				path: postPath(post.id),
			}
		})
		.with("likes_milestone", async () => {
			const post = await loadPostForPush(n.postId)
			if (!post) return null
			return {
				title: post.promptTitle,
				body: `Your ${n.commentId ? "comment" : post.noun} hit ${n.achievementCount ?? 0} likes`,
				path: postPath(post.id),
			}
		})
		.with("user_followed", async () => ({
			title: "Called My Shot",
			body: `@${n.actorUsername} followed you`,
			path: n.actorUsername ? `/user/${n.actorUsername}` : "/notifications",
		}))
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
