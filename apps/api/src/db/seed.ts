import { env } from "../env"
import {
	expiryToDate,
	type InviteExpiryOption,
	insertGroupInvite,
} from "../lib/groups"
import { hashPassword } from "../lib/password"
import { db } from "./index"
import { callSelections, calls, groupMembers, groups, users } from "./schema"

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

	const invite = await insertGroupInvite(
		group.id,
		adminUserId,
		expiryToDate(expiry),
	)
	for (const userId of memberUserIds) {
		await insertGroupInvite(group.id, userId, expiryToDate(expiry))
	}
	return { group, invite }
}

// Shapes that score off calls.guessValue directly, no questionOptions row -
// mirrors castCallSchema's own numeric-guess bucket in packages/schemas/src/
// questions.ts.
const NUMERIC_GUESS_SHAPES = new Set([
	"player_stat_numeric_guess",
	"team_stat_numeric_guess",
	"team_season_stat_numeric_guess",
])

function randomInt(min: number, max: number): number {
	return Math.floor(min + Math.random() * (max - min + 1))
}

function randomConviction(): number {
	return randomInt(20, 80)
}

// Scales a plausible guess off the same tolerance band createQuestion already
// snapshotted onto the question row - a rate stat's tolerance (batting
// average's +/-0.02) lands under 1, every counting stat's (rebounds, wins)
// doesn't, so that alone is enough to pick a sane decimal precision without
// this script knowing which real stat it's actually looking at.
function randomGuessValue(question: {
	numericTolerancePct: number | null
	numericToleranceAbsolute: number | null
}): number {
	if (question.numericToleranceAbsolute != null) {
		const scale = question.numericToleranceAbsolute
		const value = scale * randomInt(3, 15)
		return scale < 1 ? Number(value.toFixed(3)) : Math.round(value)
	}
	return randomInt(5, 50)
}

// Real questions/ballots/awards/win-totals all come from the sync jobs now
// (see db/sync/), never this script - this only lays fake calls on top of
// whatever's already been synced, the same way real users would. Run
// `pnpm sync:sports` (and let the season-question catalog sync run) before
// this, not after.
async function seedRandomCalls(userIds: string[]): Promise<void> {
	const openQuestions = await db.query.questions.findMany({
		where: { status: "open" },
		columns: {
			id: true,
			shape: true,
			picksRequired: true,
			numericTolerancePct: true,
			numericToleranceAbsolute: true,
		},
	})

	if (openQuestions.length === 0) {
		console.log(
			"  No open questions found - run `pnpm sync:sports` first so there's something to call.",
		)
		return
	}

	let callCount = 0
	for (const question of openQuestions) {
		const isNumericGuess = NUMERIC_GUESS_SHAPES.has(question.shape)
		const options = isNumericGuess
			? []
			: await db.query.questionOptions.findMany({
					where: { questionId: question.id },
				})

		for (const userId of userIds) {
			// Partial participation, not every user answering every question -
			// keeps calls from being uniformly N-deep on every single synced
			// question.
			if (Math.random() > 0.6) continue

			if (isNumericGuess) {
				await db.insert(calls).values({
					questionId: question.id,
					userId,
					guessValue: randomGuessValue(question),
					conviction: randomConviction(),
				})
				callCount++
				continue
			}

			if (options.length === 0) continue
			const pickCount = Math.min(question.picksRequired ?? 1, options.length)
			const picks = [...options]
				.sort(() => Math.random() - 0.5)
				.slice(0, pickCount)

			const [call] = await db
				.insert(calls)
				.values({ questionId: question.id, userId })
				.returning()
			await db.insert(callSelections).values(
				picks.map((option) => ({
					callId: call.id,
					optionId: option.id,
					conviction: randomConviction(),
					lossRate: option.lossRate,
					winMult: option.winMult,
					modelHitRate: option.modelHitRate,
				})),
			)
			callCount++
		}
	}
	console.log(`  ${callCount} calls across ${openQuestions.length} questions`)
}

// Fake accounts for the social layer, all signing in with "password". Their
// order is the order main() destructures the inserted rows in.
const DEMO_USERS = [
	{
		name: "Marcus Pierce",
		username: "mpwolves",
		email: "mpwolves@example.com",
	},
	{ name: "Taylor Swisher", username: "tswish", email: "tswish@example.com" },
	{
		name: "Devon Kim",
		username: "dkanalytics",
		email: "dkanalytics@example.com",
	},
	{
		name: "Riley Cross",
		username: "rcourtside",
		email: "rcourtside@example.com",
	},
	{
		name: "Bailey Knowles",
		username: "ballknower",
		email: "ballknower@example.com",
	},
	{ name: "Jordan Reyes", username: "jrhoops", email: "jrhoops@example.com" },
	{ name: "Sam Lin", username: "slballer", email: "slballer@example.com" },
	{
		name: "Steve Ostrowski",
		username: "statlinesteve",
		email: "statlinesteve@example.com",
	},
	{
		name: "Casey Vance",
		username: "courtvision",
		email: "courtvision@example.com",
	},
	{
		name: "Harper Nguyen",
		username: "hoopqueen",
		email: "hoopqueen@example.com",
	},
	{
		name: "Danny Osei",
		username: "danny_ringer",
		email: "danny.ringer@example.com",
	},
	{
		name: "Matt Delgado",
		username: "mattfantasy",
		email: "mattfantasy@example.com",
	},
]

async function main() {
	console.log("Wiping existing demo/social data...")
	// Real questions/ballots/games/teams/players/leagues/sports/stats are owned
	// by `pnpm sync:sports` + the season-question catalog sync now (see
	// db/sync/), never this script - only the fake social layer (users,
	// groups) and whatever calls/shares/disputes/notifications either this
	// script or manual dev testing generated on top of them get wiped here.
	await db.execute(
		"TRUNCATE TABLE call_selections, calls, question_shares, resolution_disputes, question_voids, notifications, group_invites, group_members, groups, sessions, users RESTART IDENTITY CASCADE",
	)

	console.log("Seeding users...")
	const quinnPasswordHash = await hashPassword("password")
	const restPasswordHash = await hashPassword("password")

	const [
		_calledMyShot,
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
				// The account every isOfficial question is attributed to (see
				// getOfficialAccountId in lib/official-account.ts) - not a real
				// hash, on purpose, so this account can never actually be signed
				// into. Matches the 20260822022433_official_account migration's
				// row exactly (same username), since that's what production runs
				// instead of this file.
				name: "Called My Shot",
				username: "calledmyshot",
				email: "official@calledmyshot.com",
				passwordHash: "NO_LOGIN_OFFICIAL_ACCOUNT",
			},
			{
				name: "Quinn Vaughn",
				username: "quinn",
				email: "qvaughn3@gmail.com",
				passwordHash: quinnPasswordHash,
				isAdmin: true,
				// Pre-verified in seed data only - real signups still start
				// unverified (see emailVerified's own comment on the users table)
				// and go through the actual change-email confirm flow. This just
				// skips re-doing that flow by hand every time local dev data gets
				// reseeded.
				emailVerified: true,
			},
			...DEMO_USERS.map((user) => ({
				...user,
				passwordHash: restPasswordHash,
			})),
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

	console.log("Seeding random calls on synced questions...")
	await seedRandomCalls([
		quinn.id,
		mpwolves.id,
		tswish.id,
		dkanalytics.id,
		rcourtside.id,
		ballknower.id,
		jrhoops.id,
		slballer.id,
		statlinesteve.id,
		courtvision.id,
		hoopqueen.id,
		dannyRinger.id,
		mattfantasy.id,
	])

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
