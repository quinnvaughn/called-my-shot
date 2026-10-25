import { match } from "ts-pattern"
import { type FragmentType, useFragment } from "#/graphql/generated"
import { PostCardFragment } from "#/graphql/posts/queries"
import { RushmorePostCard } from "./rushmore-post-card"

// The dispatcher: each kind of post is its own card with its own fragment
// (see RushmorePostCard). __typename is what tells them apart on the wire
// (the Post interface in apps/api/src/graphql/types/post/refs.ts); this is
// the one place that turns it into which card renders.
export function PostCard({
	post,
}: {
	post: FragmentType<typeof PostCardFragment>
}) {
	const p = useFragment(PostCardFragment, post)
	return match(p)
		.with({ __typename: "RushmorePost" }, (rushmore) => (
			<RushmorePostCard post={rushmore} />
		))
		.exhaustive()
}
