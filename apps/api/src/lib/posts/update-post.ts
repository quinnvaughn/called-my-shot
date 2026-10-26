import { type UpdatePostInput, updatePostSchema } from "@called-my-shot/schemas"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { type Post, posts, type User } from "../../db/schema"
import { AuthorizationError, NotFoundError, ValidationError } from "../errors"
import { assertAllowedPostText } from "./moderation"

// The words on a post are its author's to change; the picks aren't. A
// different four on a Rushmore, or a different order on a redraft, is a
// different post, which means deleting this one, so the crowd's numbers never
// count a pick that's no longer there.
export async function updatePost(
	author: User,
	input: UpdatePostInput,
	now = new Date(),
): Promise<Post> {
	const result = updatePostSchema.safeParse(input)
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
