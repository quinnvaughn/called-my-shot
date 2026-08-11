import { sql } from "drizzle-orm"
import { env } from "../env"
import {
	expiryToDate,
	type InviteExpiryOption,
	insertGroupInvite,
} from "../lib/groups"
import { hashPassword } from "../lib/password"
import { db } from "./index"
import { groupMembers, groups, users } from "./schema"

if (env.NODE_ENV === "production" && !env.ALLOW_PROD_SEED) {
	throw new Error(
		"Refusing to run the seed script against production. Set ALLOW_PROD_SEED=true to override.",
	)
}

async function createGroup(
	name: string,
	adminUserId: string,
	memberUserIds: string[],
	expiry: InviteExpiryOption,
) {
	const [group] = await db
		.insert(groups)
		.values({ name, createdBy: adminUserId })
		.returning()

	await db.insert(groupMembers).values([
		{ groupId: group.id, userId: adminUserId, role: "admin" as const },
		...memberUserIds.map((userId) => ({
			groupId: group.id,
			userId,
			role: "member" as const,
		})),
	])

	const invite = await insertGroupInvite(group.id, expiryToDate(expiry))
	return { group, invite }
}

async function main() {
	console.log("Wiping existing data...")
	await db.execute(
		sql`TRUNCATE TABLE group_invites, group_members, groups, sessions, users RESTART IDENTITY CASCADE`,
	)

	console.log("Seeding users...")
	const quinnPasswordHash = await hashPassword("password")
	const restPasswordHash = await hashPassword("password")

	const [
		quinn,
		mpwolves,
		tswish,
		dkanalytics,
		rcourtside,
		ballknower,
		jrhoops,
		slballer,
		statlinesteve,
		courtvision,
		hoopqueen,
		dannyRinger,
		mattfantasy,
	] = await db
		.insert(users)
		.values([
			{
				name: "Quinn Vaughn",
				username: "quinn",
				email: "qvaughn3@gmail.com",
				passwordHash: quinnPasswordHash,
			},
			{
				name: "Marcus Pierce",
				username: "mpwolves",
				email: "mpwolves@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Taylor Swisher",
				username: "tswish",
				email: "tswish@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Devon Kim",
				username: "dkanalytics",
				email: "dkanalytics@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Riley Cross",
				username: "rcourtside",
				email: "rcourtside@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Bailey Knowles",
				username: "ballknower",
				email: "ballknower@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Jordan Reyes",
				username: "jrhoops",
				email: "jrhoops@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Sam Lin",
				username: "slballer",
				email: "slballer@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Steve Ostrowski",
				username: "statlinesteve",
				email: "statlinesteve@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Casey Vance",
				username: "courtvision",
				email: "courtvision@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Harper Nguyen",
				username: "hoopqueen",
				email: "hoopqueen@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Danny Osei",
				username: "danny_ringer",
				email: "danny.ringer@example.com",
				passwordHash: restPasswordHash,
			},
			{
				name: "Matt Delgado",
				username: "mattfantasy",
				email: "mattfantasy@example.com",
				passwordHash: restPasswordHash,
			},
		])
		.returning()

	console.log("Seeding groups...")

	// quinn is admin here
	const wolfpack = await createGroup(
		"Wolfpack",
		quinn.id,
		[mpwolves.id, tswish.id, dkanalytics.id, rcourtside.id, ballknower.id],
		"SEVEN_DAYS",
	)

	// quinn is a regular member here
	const fantasyLeagueChat = await createGroup(
		"Fantasy League Chat",
		jrhoops.id,
		[
			quinn.id,
			mpwolves.id,
			tswish.id,
			dkanalytics.id,
			rcourtside.id,
			ballknower.id,
			slballer.id,
			statlinesteve.id,
			courtvision.id,
			hoopqueen.id,
		],
		"NO_EXPIRY",
	)

	// quinn isn't in this one - use its invite code to test the join/preview flow
	const ringerFantasyShow = await createGroup(
		"The Ringer Fantasy Show",
		dannyRinger.id,
		[mattfantasy.id, statlinesteve.id, courtvision.id],
		"NO_EXPIRY",
	)

	console.log("\nDone.\n")
	console.log("Log in as quinn: qvaughn3@gmail.com / password")
	console.log("\nGroups:")
	console.log(
		`  Wolfpack               (quinn = admin)   code: ${wolfpack.invite.code}`,
	)
	console.log(
		`  Fantasy League Chat    (quinn = member)  code: ${fantasyLeagueChat.invite.code}`,
	)
	console.log(
		`  The Ringer Fantasy Show (quinn not a member, pending invite) code: ${ringerFantasyShow.invite.code}`,
	)

	await db.$client.end()
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
