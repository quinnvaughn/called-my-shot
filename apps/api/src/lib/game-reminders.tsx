import { gamePath } from "@called-my-shot/schemas"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "../db"
import { gameReminders } from "../db/schema"
import {
	GameReminder,
	gameReminderSubject,
	type ReminderGame,
} from "../emails/game-reminder"
import { renderEmail } from "../emails/render"
import { env } from "../env"
import { emailUrl, withUtm } from "./email-links"
import { isMuted, mutedEmailTypesByUser } from "./email-prefs"
import { oneClickUnsubscribeUrl, unsubscribePageUrl } from "./email-unsubscribe"
import { sendMail } from "./mailer"
import { createNotifications } from "./notifications"

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

type SendFn = typeof sendMail

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
// in-app included, since "starts in an hour" would be false by then.
async function skipStartedGames(): Promise<number> {
	const { rowCount } = await db.execute(sql`
		update game_reminders r
		set sent_at = now(), skipped_reason = 'game_started'
		from games g
		where g.id = r.game_id
			and r.sent_at is null
			and (g.status <> 'scheduled' or g.starts_at <= now())
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
// attempt in the same statement, like the digest's claim - and like that one,
// this is not mutual exclusion; DRAIN_GAME_REMINDERS_LOCK is.
async function claimDueBatches(): Promise<Claimed[]> {
	const { rows } = await db.execute<Claimed>(sql`
		with due_users as (
			select distinct r.user_id
			from game_reminders r
			join games g on g.id = r.game_id
			where r.sent_at is null
				and r.attempts < ${MAX_ATTEMPTS}
				and g.status = 'scheduled'
				and g.starts_at > now()
				and g.starts_at <= now() + ${REMINDER_LEAD_MINUTES} * interval '1 minute'
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
				and g.starts_at > now()
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
				and g.starts_at < f.starts_at + ${BATCH_WINDOW_MINUTES} * interval '1 minute'
			for update of r skip locked
		)
		returning id, user_id, game_id, attempts
	`)
	return rows
}

type LoadedGame = ReminderGame & { id: string }

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
		byId.set(game.id, {
			id: game.id,
			matchup: `${awayTeam.abbreviation} @ ${homeTeam.abbreviation}`,
			awayTeamName: awayTeam.name,
			homeTeamName: homeTeam.name,
			leagueAbbr: league.abbreviation,
			startsAt: game.startsAt,
			gameUrl: emailUrl(gamePath({ ...game, league, homeTeam, awayTeam }), {
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
): Promise<void> {
	await db.transaction(async (tx) => {
		await createNotifications(
			tx,
			rows.map((row) => ({
				type: "game_reminder" as const,
				userId,
				gameId: row.game_id,
			})),
		)
		await tx
			.update(gameReminders)
			.set({ sentAt: new Date(), skippedReason })
			.where(
				inArray(
					gameReminders.id,
					rows.map((row) => row.id),
				),
			)
	})
}

// MUST be called under DRAIN_GAME_REMINDERS_LOCK (lib/job-lock.ts), for the
// same reason as drainResolutionDigests.
export async function drainGameReminders({
	send = sendMail,
}: {
	send?: SendFn
} = {}): Promise<{ sent: number; muted: number; failed: number }> {
	const started = await skipStartedGames()
	const claimed = await claimDueBatches()
	if (claimed.length === 0) {
		if (started > 0) console.log(`[game-reminders] skipped_started=${started}`)
		return { sent: 0, muted: 0, failed: 0 }
	}

	const byUser = new Map<string, Claimed[]>()
	for (const row of claimed) {
		const rows = byUser.get(row.user_id) ?? []
		rows.push(row)
		byUser.set(row.user_id, rows)
	}
	const userIds = [...byUser.keys()]

	const games = await loadGames([...new Set(claimed.map((r) => r.game_id))])
	const users = await db.query.users.findMany({
		where: { id: { in: userIds } },
		columns: { id: true, email: true },
	})
	const emailByUser = new Map(users.map((u) => [u.id, u.email]))
	const mutedByUser = await mutedEmailTypesByUser(userIds)

	let sent = 0
	let muted = 0
	let failed = 0
	for (const [userId, rows] of byUser) {
		const email = emailByUser.get(userId)
		const batch = rows
			.flatMap((row) => games.get(row.game_id) ?? [])
			.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
		// A user or game deleted since the claim cascades its reminder rows away,
		// so both are present in practice; the guard is for the types.
		if (!email || batch.length === 0) continue

		// Deliberately not gated on emailVerified or emailBouncedAt, same as the
		// resolution digest: this mails one person who just asked for it, and
		// bounces are Resend's suppression list.
		if (isMuted(mutedByUser.get(userId), "game_reminder")) {
			await finish(userId, rows, "muted")
			muted += 1
			continue
		}

		const result = await sendReminderEmail(userId, email, batch, send)
		if (result.ok) {
			await finish(userId, rows, null)
			sent += 1
			continue
		}

		failed += 1
		await db
			.update(gameReminders)
			.set({ lastError: result.error })
			.where(
				inArray(
					gameReminders.id,
					rows.map((row) => row.id),
				),
			)
		// Out of retries: the email isn't coming, but the in-app notification
		// still can before the game starts.
		if (rows.some((row) => row.attempts >= MAX_ATTEMPTS)) {
			await finish(userId, rows, "send_failed")
		}
	}

	console.log(
		`[game-reminders] claimed=${claimed.length} users=${byUser.size} sent=${sent} muted=${muted} failed=${failed} skipped_started=${started}`,
	)
	return { sent, muted, failed }
}

async function sendReminderEmail(
	userId: string,
	to: string,
	games: ReminderGame[],
	send: SendFn,
): ReturnType<SendFn> {
	const tag = { campaign: "game_reminder" } as const
	const { html, text } = await renderEmail(
		<GameReminder
			games={games}
			manageUrl={emailUrl("/settings", { ...tag, content: "manage" })}
			unsubscribeUrl={withUtm(unsubscribePageUrl(userId, "game_reminder"), {
				...tag,
				content: "unsubscribe",
			})}
			logoUrl={`${env.CLIENT_ORIGIN}/email-logo.png`}
		/>,
	)

	return send({
		to,
		from: env.EMAIL_FROM_NOTIFICATIONS,
		subject: gameReminderSubject(games),
		text,
		html,
		headers: {
			"List-Unsubscribe": `<${oneClickUnsubscribeUrl(userId, "game_reminder")}>`,
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		},
		tags: [{ name: "type", value: "game_reminder" }],
	})
}
