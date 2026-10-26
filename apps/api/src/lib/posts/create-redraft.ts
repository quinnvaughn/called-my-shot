import {
	type CreateRedraftInput,
	createRedraftSchema,
} from "@called-my-shot/schemas"
import { db } from "../../db"
import {
	type Post,
	posts,
	postTags,
	redraftPicks,
	type User,
} from "../../db/schema"
import { classLengths } from "../drafts/class"
import { playersInClass } from "../drafts/pool"
import { NotFoundError, ValidationError } from "../errors"
import { requireGroupMember } from "../groups"
import { isUniqueViolation } from "../invite-codes"
import { assertAllowedPostText } from "./moderation"
import { redraftTags } from "./tags"

// One person's redraft of a class: the first N slots filled with different
// players from that class, N being one of the lengths the class offers,
// posted for everyone or into one of the author's groups. The row, its picks
// and its tags land in one transaction, like a Rushmore's.
export async function createRedraft(
	author: User,
	input: CreateRedraftInput,
): Promise<Post> {
	const result = createRedraftSchema.safeParse(input)
	if (!result.success) throw ValidationError.fromZodIssues(result.error.issues)
	const parsed = result.data
	const prompt = await db.query.prompts.findFirst({
		where: { id: parsed.promptId },
	})
	if (
		!prompt ||
		prompt.removedAt ||
		prompt.kind !== "redraft" ||
		!prompt.leagueId ||
		prompt.draftYear === null
	) {
		throw new NotFoundError("That draft class doesn't exist.")
	}
	const leagueId = prompt.leagueId
	if (parsed.groupId) await requireGroupMember(parsed.groupId, author.id)

	const playerIds = parsed.playerIds
	const lengths = await classLengths(prompt)
	if (!lengths.some((length) => length.count === playerIds.length)) {
		const counts = lengths.map((length) => String(length.count))
		throw ValidationError.field(
			"playerIds",
			`Fill exactly ${counts.slice(0, -1).join(", ")}${counts.length > 1 ? " or " : ""}${counts[counts.length - 1] ?? ""} slots.`,
		)
	}
	const inClass = await playersInClass(db, prompt, playerIds)
	if (inClass.size !== playerIds.length) {
		throw ValidationError.field(
			"playerIds",
			`Every pick has to come from the ${prompt.draftYear} class.`,
		)
	}

	await assertAllowedPostText(author.id, [{ field: "body", text: parsed.body }])

	try {
		return await db.transaction(async (tx) => {
			const [post] = await tx
				.insert(posts)
				.values({
					authorId: author.id,
					kind: "redraft",
					promptId: prompt.id,
					groupId: parsed.groupId ?? null,
					body: parsed.body || null,
				})
				.returning()
			if (!post) throw new Error("Post insert returned nothing")
			await tx.insert(redraftPicks).values(
				playerIds.map((playerId, i) => ({
					postId: post.id,
					slot: i + 1,
					playerId,
				})),
			)
			await tx.insert(postTags).values(
				redraftTags({ leagueId }, playerIds).map((tag) => ({
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
					? "You already have a redraft of this class in that group."
					: "You already have a redraft of this class.",
			)
		}
		throw err
	}
}
