import type { Target } from "./notification-shell"

// A post's page, at its thread.
export const postTarget = (post: { id: string } | null): Target =>
	post
		? { to: "/posts/$postId", params: { postId: post.id }, hash: "comments" }
		: null
