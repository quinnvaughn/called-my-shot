import {
	type UpdateRushmoreInput,
	updateRushmoreSchema,
} from "@called-my-shot/schemas"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { type Post, posts, type User } from "../../db/schema"
import { AuthorizationError, NotFoundError, ValidationError } from "../errors"
import { assertAllowedPostText } from "./moderation"

// The words on a Rushmore are its author's to change; the faces aren't. A
// different four is a different Rushmore, which means deleting this one, so
// the crowd's numbers never count someone who's no longer up there.
export async function updateRushmore(
	author: User,
	input: UpdateRushmoreInput,
	now = new Date(),
): Promise<Post> {
	const result = updateRushmoreSchema.safeParse(input)
	if (!result.success) throw ValidationError.fromZodIssues(result.error.issues)
	const parsed = result.data

	const post = await db.query.posts.findFirst({
		where: { id: parsed.postId },
	})
	if (!post || post.removedAt) throw new NotFoundError("Post not found")
	if (post.authorId !== author.id) {
		throw new AuthorizationError("Only its author can edit this.")
	}

	await assertAllowedPostText(author.id, [{ field: "body", text: parsed.body }])

	const [updated] = await db
		.update(posts)
		.set({ editedAt: now, body: parsed.body || null })
		.where(eq(posts.id, post.id))
		.returning()
	if (!updated) throw new NotFoundError("Post not found")
	return updated
}
