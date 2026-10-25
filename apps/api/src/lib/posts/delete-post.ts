import { eq } from "drizzle-orm"
import { db } from "../../db"
import { posts, type User } from "../../db/schema"
import { AuthorizationError, NotFoundError } from "../errors"

// The author taking their post down for good, comments, likes and all.
export async function deletePost(author: User, postId: string): Promise<void> {
	const post = await db.query.posts.findFirst({
		where: { id: postId },
		columns: { authorId: true },
	})
	if (!post) throw new NotFoundError("Post not found")
	if (post.authorId !== author.id) {
		throw new AuthorizationError("Only its author can delete this.")
	}
	await db.delete(posts).where(eq(posts.id, postId))
}
