import { and, eq, inArray, or } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../../db"
import {
	type FollowTargetKind,
	follows,
	teams,
	type User,
} from "../../db/schema"
import type { DbOrTx, Tx } from "../../db/types"
import { AuthorizationError, NotFoundError, ValidationError } from "../errors"
import { createNotifications } from "../notifications"
import { isBlockedEitherWay } from "../pressers/ask"

// Following is how someone builds their Home: the leagues, teams and players
// whose posts they want, and the people whose posts they want. One-way, and
// idempotent both ways: following twice is one follow, unfollowing what you
// don't follow is a no-op.
//
// Following a person tells them, in-app only (user_followed). A re-follow
// after an unfollow says it again by marking the same notification unread
// rather than adding a second.

async function targetExists(
	kind: FollowTargetKind,
	id: string,
): Promise<boolean> {
	const where = { where: { id }, columns: { id: true } } as const
	const row = await match(kind)
		.with("user", () => db.query.users.findFirst(where))
		.with("league", () => db.query.leagues.findFirst(where))
		.with("team", () => db.query.teams.findFirst(where))
		.with("player", () => db.query.players.findFirst(where))
		.exhaustive()
	return row !== undefined
}

export async function follow(
	follower: User,
	kind: FollowTargetKind,
	targetId: string,
): Promise<void> {
	if (kind === "user" && targetId === follower.id) {
		throw ValidationError.field(null, "You can't follow yourself.")
	}
	if (!(await targetExists(kind, targetId))) {
		throw new NotFoundError(
			match(kind)
				.with("user", () => "User not found")
				.with("league", () => "League not found")
				.with("team", () => "Team not found")
				.with("player", () => "Player not found")
				.exhaustive(),
		)
	}
	if (
		kind === "user" &&
		(await isBlockedEitherWay(db, follower.id, targetId))
	) {
		throw new AuthorizationError("You can't follow this person.")
	}

	await db.transaction(async (tx) => {
		const [added] = await tx
			.insert(follows)
			.values({ followerId: follower.id, targetKind: kind, targetId })
			.onConflictDoNothing()
			.returning({ targetId: follows.targetId })
		if (!added || kind !== "user") return
		await createNotifications(tx, [
			{
				type: "user_followed",
				userId: targetId,
				actorId: follower.id,
				actorUsername: follower.username,
			},
		])
	})
}

export async function unfollow(
	follower: User,
	kind: FollowTargetKind,
	targetId: string,
): Promise<void> {
	await db
		.delete(follows)
		.where(
			and(
				eq(follows.followerId, follower.id),
				eq(follows.targetKind, kind),
				eq(follows.targetId, targetId),
			),
		)
}

// A fan wants their team in their feed, and the league it plays in. Called
// when favorites are saved. Only ever adds: dropping a favorite isn't
// unfollowing, since following a team is its own choice once made.
export async function followTeamsAndLeagues(
	tx: Tx,
	userId: string,
	teamIds: string[],
): Promise<void> {
	if (teamIds.length === 0) return
	const rows = await tx
		.select({ id: teams.id, leagueId: teams.leagueId })
		.from(teams)
		.where(inArray(teams.id, teamIds))
	const values = [
		...rows.map((team) => ({
			followerId: userId,
			targetKind: "team" as const,
			targetId: team.id,
		})),
		...[...new Set(rows.map((team) => team.leagueId))].map((leagueId) => ({
			followerId: userId,
			targetKind: "league" as const,
			targetId: leagueId,
		})),
	]
	if (values.length === 0) return
	await tx.insert(follows).values(values).onConflictDoNothing()
}

// A block ends any following between the two, either way.
export async function dropFollowsBetween(
	q: DbOrTx,
	a: string,
	b: string,
): Promise<void> {
	await q
		.delete(follows)
		.where(
			and(
				eq(follows.targetKind, "user"),
				or(
					and(eq(follows.followerId, a), eq(follows.targetId, b)),
					and(eq(follows.followerId, b), eq(follows.targetId, a)),
				),
			),
		)
}
