import {
	type CreateRushmoreInput,
	createRushmoreSchema,
} from "@called-my-shot/schemas"
import { db } from "../../db"
import {
	type Post,
	type Prompt,
	posts,
	postTags,
	rushmorePicks,
	type User,
} from "../../db/schema"
import { NotFoundError, ValidationError } from "../errors"
import { requireGroupMember } from "../groups"
import { isUniqueViolation } from "../invite-codes"
import { leaguesPlayedIn, playersInPool } from "../prompts/pool"
import { assertAllowedPostText } from "./moderation"
import { rushmoreTags } from "./tags"

// One person's Rushmore for a prompt: four different players, all from the
// prompt's pool, posted for everyone or into one of the author's groups.
// Everything the post is (the row, its picks and the spaces it's tagged
// with) lands in one transaction, so a feed never sees a post without its
// faces.
export async function createRushmore(
	author: User,
	input: CreateRushmoreInput,
): Promise<Post> {
	const result = createRushmoreSchema.safeParse(input)
	if (!result.success) throw ValidationError.fromZodIssues(result.error.issues)
	const parsed = result.data
	const prompt = await db.query.prompts.findFirst({
		where: { id: parsed.promptId },
	})
	if (!prompt || prompt.removedAt || prompt.kind !== "rushmore") {
		throw new NotFoundError("That prompt doesn't exist.")
	}
	if (parsed.groupId) await requireGroupMember(parsed.groupId, author.id)

	const playerIds = parsed.playerIds
	const inPool = await playersInPool(db, prompt, playerIds)
	if (inPool.size !== playerIds.length) {
		throw ValidationError.field("playerIds", await outsidePoolMessage(prompt))
	}

	await assertAllowedPostText(author.id, [{ field: "body", text: parsed.body }])
	const pickLeagueIds = prompt.leagueId
		? []
		: await leaguesPlayedIn(db, playerIds)

	try {
		return await db.transaction(async (tx) => {
			const [post] = await tx
				.insert(posts)
				.values({
					authorId: author.id,
					kind: "rushmore",
					promptId: prompt.id,
					groupId: parsed.groupId ?? null,
					body: parsed.body || null,
				})
				.returning()
			if (!post) throw new Error("Post insert returned nothing")
			await tx.insert(rushmorePicks).values(
				playerIds.map((playerId, position) => ({
					postId: post.id,
					playerId,
					position,
				})),
			)
			await tx.insert(postTags).values(
				rushmoreTags(prompt, playerIds, pickLeagueIds).map((tag) => ({
					postId: post.id,
					...tag,
				})),
			)
			return post
		})
	} catch (err) {
		if (isUniqueViolation(err)) {
			throw ValidationError.field(
				null,
				parsed.groupId
					? "You already have a Rushmore for this in that group."
					: "You already have a Rushmore for this.",
			)
		}
		throw err
	}
}

// What every pick has to have done, from everything the prompt narrows by:
// "Every pick has to have played for the Celtics, at PG or SG, between 2010
// and 2019."
async function outsidePoolMessage(prompt: Prompt): Promise<string> {
	const parts: string[] = []
	if (prompt.teamId) {
		const team = await db.query.teams.findFirst({
			where: { id: prompt.teamId },
			columns: { name: true },
		})
		parts.push(`for the ${team?.name ?? "team"}`)
	} else if (prompt.leagueId) {
		const league = await db.query.leagues.findFirst({
			where: { id: prompt.leagueId },
			columns: { abbreviation: true },
		})
		parts.push(`in the ${league?.abbreviation ?? "league"}`)
	}
	if (prompt.positions.length > 0) {
		parts.push(`at ${listWithOr(prompt.positions)}`)
	}
	const years = yearsPhrase(prompt.fromYear, prompt.toYear)
	if (years) parts.push(years)
	if (parts.length === 0) {
		return "Every pick has to come from the player search."
	}
	return `Every pick has to have played ${parts.join(", ")}.`
}

function listWithOr(items: string[]): string {
	return items.length <= 1
		? (items[0] ?? "")
		: `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`
}

function yearsPhrase(from: number | null, to: number | null): string | null {
	if (from !== null && to !== null) return `between ${from} and ${to}`
	if (from !== null) return `in ${from} or later`
	if (to !== null) return `in ${to} or earlier`
	return null
}
