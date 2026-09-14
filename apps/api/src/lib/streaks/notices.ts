import type { StreakFamily } from "@called-my-shot/scoring"
import { and, eq } from "drizzle-orm"
import { achievementNotices } from "../../db/schema"
import { createNotifications, type NotificationInput } from "../notifications"
import type { Tx } from "../user-season-stats"

// The identity of each announceable event. A streak event is tied to the run
// it happened in (named by the run's first call), so a new run can reach the
// same milestone again, but the same run can't.
export const noticeKey = {
	sweep: (leagueId: string, slateKey: string) =>
		`sweep:${leagueId}:${slateKey}`,
	milestone: (
		leagueId: string,
		family: StreakFamily,
		runStartCallId: string,
		milestone: number,
	) => `milestone:${leagueId}:${family}:${runStartCallId}:${milestone}`,
	personalBest: (
		leagueId: string,
		family: StreakFamily,
		runStartCallId: string,
	) => `best:${leagueId}:${family}:${runStartCallId}`,
	snapped: (leagueId: string, family: StreakFamily, runStartCallId: string) =>
		`snapped:${leagueId}:${family}:${runStartCallId}`,
}

// Notifies the user of an event only the first time its key is seen for them,
// ever. The insert is the check, so it holds under a rebuild that runs again,
// and after a result is overturned and then restored.
export async function announceOnce(
	tx: Tx,
	dedupeKey: string,
	input: NotificationInput,
): Promise<boolean> {
	const [notice] = await tx
		.insert(achievementNotices)
		.values({ userId: input.userId, dedupeKey })
		.onConflictDoNothing()
		.returning({ userId: achievementNotices.userId })
	if (!notice) return false

	const [notification] = await createNotifications(tx, [input])
	if (notification) {
		await tx
			.update(achievementNotices)
			.set({ notificationId: notification.id })
			.where(
				and(
					eq(achievementNotices.userId, input.userId),
					eq(achievementNotices.dedupeKey, dedupeKey),
				),
			)
	}
	return true
}
