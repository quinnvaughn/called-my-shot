import { randomUUID } from "node:crypto"
import { gamePath } from "@called-my-shot/schemas"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "../db"
import { gameReminders } from "../db/schema"
import {
	GameReminder,
	gameReminderSubject,
	type ReminderGame,
} from "../emails/game-reminder"
import { env } from "../env"
import { emailUrl } from "./email-links"
import { loadRecipients } from "./email-prefs"
import { type SendFn, sendListEmail } from "./email-send"
import { sendMail } from "./mailer"
import { createNotifications } from "./notifications"
import { markOutboxDone, markOutboxFailed, utcTimestamp } from "./outbox"
import { isPushMuted, loadPushMutes } from "./push-prefs"
import {
	deliverPush,
	type PushMessage,
	type PushSendFn,
	pushConfigured,
	webPushSend,
} from "./push-send"
import { loadLiveSubscriptions } from "./push-subscriptions"

// How long before a game starts its reminder goes out. An hour is late enough
// that lineups and NFL inactives are usually posted, and early enough to still
// make calls before they lock at the start.
export const REMINDER_LEAD_MINUTES = 60

// Once one of a user's reminders is due, every other reminder of theirs for a
// game starting within this long after the earliest one goes out with it. A
// same-time slate is one email either way; this is what keeps a game twenty
// minutes later from arriving as a second email a few ticks after the first.
export const BATCH_WINDOW_MINUTES = 30

const MAX_USERS_PER_RUN = 200

// Low on purpose: the drain runs every 5 minutes and the reminder is only
// useful before the game starts, so a send that keeps failing gives up while
// there is still time to deliver the in-app notification on its own.
const MAX_ATTEMPTS = 3

export async function setGameReminder(
	userId: string,
	gameId: string,
): Promise<void> {
	await db
		.insert(gameReminders)
		.values({ userId, gameId })
		.onConflictDoNothing({
			target: [gameReminders.userId, gameReminders.gameId],
		})
}

// Deletes the row whether or not it already went out, so turning a reminder
// back on inside the last hour sends it again rather than silently doing
// nothing.
export async function removeGameReminder(
	userId: string,
	gameId: string,
): Promise<void> {
	await db
		.delete(gameReminders)
		.where(
			and(eq(gameReminders.userId, userId), eq(gameReminders.gameId, gameId)),
		)
}

export async function hasGameReminder(
	userId: string,
	gameId: string,
): Promise<boolean> {
	const row = await db.query.gameReminders.findFirst({
		where: { userId, gameId },
		columns: { id: true },
	})
	return Boolean(row)
}

// A reminder for a game that has already started (or been marked live/final
// by the score sync) is no use to anyone. Finished without sending anything,
// in-app included, since "starts in an hour" would be false by then. A start
// time ESPN hasn't set is a placeholder, so passing it doesn't mean anything.
async function skipStartedGames(now: Date): Promise<number> {
	const nowUtc = utcTimestamp(now)
	const { rowCount } = await db.execute(sql`
		update game_reminders r
		set sent_at = ${nowUtc}, skipped_reason = 'game_started'
		from games g
		where g.id = r.game_id
			and r.sent_at is null
			and (
				g.status <> 'scheduled'
				or (g.starts_at <= ${nowUtc} and not g.start_time_tbd)
			)
	`)
	return rowCount ?? 0
}

type Claimed = {
	id: string
	user_id: string
	game_id: string
	attempts: number
}

// Picks users with at least one reminder inside the lead window, then claims
// each of those users' whole batch (see BATCH_WINDOW_MINUTES). Spends an
// attempt in the same statement, like claimOutboxRows (lib/outbox.ts) - and
// like that one, this is not mutual exclusion; DRAIN_GAME_REMINDERS_LOCK is.
async function claimDueBatches(now: Date): Promise<Claimed[]> {
	const nowUtc = utcTimestamp(now)
	const { rows } = await db.execute<Claimed>(sql`
		with due_users as (
			select distinct r.user_id
			from game_reminders r
			join games g on g.id = r.game_id
			where r.sent_at is null
				and r.attempts < ${MAX_ATTEMPTS}
				and g.status = 'scheduled'
				and not g.start_time_tbd
				and g.starts_at > ${nowUtc}
				and g.starts_at <= ${nowUtc} + ${REMINDER_LEAD_MINUTES} * interval '1 minute'
			limit ${MAX_USERS_PER_RUN}
		),
		first_start as (
			select r.user_id, min(g.starts_at) as starts_at
			from game_reminders r
			join games g on g.id = r.game_id
			where r.user_id in (select user_id from due_users)
				and r.sent_at is null
				and r.attempts < ${MAX_ATTEMPTS}
				and g.status = 'scheduled'
				and not g.start_time_tbd
				and g.starts_at > ${nowUtc}
			group by r.user_id
		)
		update game_reminders
		set attempts = attempts + 1
		where id in (
			select r.id
			from game_reminders r
			join games g on g.id = r.game_id
			join first_start f on f.user_id = r.user_id
			where r.sent_at is null
				and r.attempts < ${MAX_ATTEMPTS}
				and g.status = 'scheduled'
				and not g.start_time_tbd
				and g.starts_at < f.starts_at + ${BATCH_WINDOW_MINUTES} * interval '1 minute'
			for update of r skip locked
		)
		returning id, user_id, game_id, attempts
	`)
	return rows
}

const rowsIn = (rows: { id: string }[]) =>
	inArray(
		gameReminders.id,
		rows.map((row) => row.id),
	)

type LoadedGame = ReminderGame & { id: string; path: string }

async function loadGames(gameIds: string[]): Promise<Map<string, LoadedGame>> {
	const rows = await db.query.games.findMany({
		where: { id: { in: gameIds } },
		columns: { id: true, startsAt: true },
		with: {
			league: { columns: { slug: true, abbreviation: true } },
			homeTeam: { columns: { name: true, abbreviation: true } },
			awayTeam: { columns: { name: true, abbreviation: true } },
		},
	})
	const byId = new Map<string, LoadedGame>()
	for (const { league, homeTeam, awayTeam, ...game } of rows) {
		// All three are non-null foreign keys; the relation types just can't say so.
		if (!league || !homeTeam || !awayTeam) continue
		const path = gamePath({ ...game, league, homeTeam, awayTeam })
		byId.set(game.id, {
			id: game.id,
			path,
			matchup: `${awayTeam.abbreviation} @ ${homeTeam.abbreviation}`,
			awayTeamName: awayTeam.name,
			homeTeamName: homeTeam.name,
			leagueAbbr: league.abbreviation,
			startsAt: game.startsAt,
			gameUrl: emailUrl(path, {
				campaign: "game_reminder",
				content: "game_row",
			}),
		})
	}
	return byId
}

// Creates the in-app notifications and stamps the rows done in one
// transaction, so a retry can never notify twice.
async function finish(
	userId: string,
	rows: Claimed[],
	skippedReason: string | null,
	now: Date,
	notificationIds?: Map<string, string>,
): Promise<void> {
	await db.transaction(async (tx) => {
		await createNotifications(
			tx,
			rows.map((row) => ({
				type: "game_reminder" as const,
				userId,
				gameId: row.game_id,
				id: notificationIds?.get(row.id),
			})),
		)
		await markOutboxDone(
			gameReminders,
			rowsIn(rows),
			{ now, skippedReason },
			tx,
		)
	})
}

// One push for a user's whole batch, opening the first game. The lock
// screen has no time zone to show a start time in, so it counts down instead.
export function gameReminderPush(
	batch: LoadedGame[],
	now: Date,
	notificationIds: string[],
): PushMessage {
	const [first] = batch
	const minutes = Math.max(
		1,
		Math.round((first.startsAt.getTime() - now.getTime()) / 60_000),
	)
	return {
		title:
			batch.length === 1
				? `${first.matchup} starts in ${minutes} min`
				: `${batch.length} games you asked about start soon`,
		body:
			batch.length === 1
				? "Check who's starting before calls lock."
				: `First up: ${first.matchup} in ${minutes} min. Check who's starting before calls lock.`,
		path: first.path,
		tag: `reminder:${first.id}`,
		type: "game_reminder",
		notificationIds,
	}
}

// MUST be called under DRAIN_GAME_REMINDERS_LOCK (lib/job-lock.ts), for the
// same reason as drainResolutionDigests.
//
// A user with a device gets a push instead of the email. The email is only
// the fallback, for someone with no device or a push no device accepted.
export async function drainGameReminders({
	send = sendMail,
	pushSend = webPushSend,
	now = new Date(),
}: {
	send?: SendFn
	pushSend?: PushSendFn
	now?: Date
} = {}): Promise<{
	sent: number
	pushed: number
	muted: number
	failed: number
}> {
	const started = await skipStartedGames(now)
	const claimed = await claimDueBatches(now)
	if (claimed.length === 0) {
		if (started > 0) console.log(`[game-reminders] skipped_started=${started}`)
		return { sent: 0, pushed: 0, muted: 0, failed: 0 }
	}

	const byUser = new Map<string, Claimed[]>()
	for (const row of claimed) {
		const rows = byUser.get(row.user_id) ?? []
		rows.push(row)
		byUser.set(row.user_id, rows)
	}
	const userIds = [...byUser.keys()]

	const games = await loadGames([...new Set(claimed.map((r) => r.game_id))])
	const recipients = await loadRecipients(userIds, "game_reminder")
	const [devices, pushMutes] = pushConfigured()
		? await Promise.all([
				loadLiveSubscriptions(userIds, now),
				loadPushMutes(userIds),
			])
		: [new Map(), new Map()]

	let sent = 0
	let pushed = 0
	let muted = 0
	let failed = 0
	for (const [userId, rows] of byUser) {
		const recipient = recipients.get(userId)
		const batch = rows
			.flatMap((row) => games.get(row.game_id) ?? [])
			.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
		// A user or game deleted since the claim cascades its reminder rows away,
		// so both are present in practice; the guard is for the types.
		if (!recipient || batch.length === 0) continue

		const targets = devices.get(userId) ?? []
		if (
			targets.length > 0 &&
			!isPushMuted(pushMutes.get(userId), "game_reminder")
		) {
			const ttl = Math.max(
				60,
				Math.round((batch[0].startsAt.getTime() - now.getTime()) / 1000),
			)
			// The notifications are written only once the push lands, so their
			// ids are picked now for the push to carry.
			const notificationIds = new Map(rows.map((row) => [row.id, randomUUID()]))
			const result = await deliverPush(
				targets,
				gameReminderPush(batch, now, [...notificationIds.values()]),
				{ ttl, urgency: "high" },
				pushSend,
				now,
			)
			if (result.delivered > 0) {
				await finish(userId, rows, "pushed", now, notificationIds)
				pushed += 1
				continue
			}
		}

		// Deliberately not gated on emailVerified or emailBouncedAt, same as the
		// resolution digest: this mails one person who just asked for it, and
		// bounces are Resend's suppression list.
		if (recipient.muted) {
			await finish(userId, rows, "muted", now)
			muted += 1
			continue
		}

		const result = await sendListEmail(
			{
				userId,
				to: recipient.email,
				type: "game_reminder",
				campaign: "game_reminder",
				from: env.EMAIL_FROM_NOTIFICATIONS,
				subject: gameReminderSubject(batch),
				render: (links) => <GameReminder {...links} games={batch} />,
			},
			send,
		)
		if (result.ok) {
			await finish(userId, rows, null, now)
			sent += 1
			continue
		}

		failed += 1
		await markOutboxFailed(gameReminders, rowsIn(rows), result.error)
		// Out of retries: the email isn't coming, but the in-app notification
		// still can before the game starts.
		if (rows.some((row) => row.attempts >= MAX_ATTEMPTS)) {
			await finish(userId, rows, "send_failed", now)
		}
	}

	console.log(
		`[game-reminders] claimed=${claimed.length} users=${byUser.size} sent=${sent} pushed=${pushed} muted=${muted} failed=${failed} skipped_started=${started}`,
	)
	return { sent, pushed, muted, failed }
}
