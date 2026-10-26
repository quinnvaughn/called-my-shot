import { match } from "ts-pattern"

// The kinds of post, as the api names them (posts.kind) and as each
// variant's __typename says them.
export type PostKind = "rushmore" | "redraft"

export const postKindOf = (typename: "RushmorePost" | "RedraftPost") =>
	match(typename)
		.with("RushmorePost", (): PostKind => "rushmore")
		.with("RedraftPost", (): PostKind => "redraft")
		.exhaustive()

// What a kind of post is called in a sentence: "Delete this redraft?",
// "commented on your Rushmore".
export const postNoun = (kind: PostKind) =>
	match(kind)
		.with("rushmore", () => "Rushmore")
		.with("redraft", () => "redraft")
		.exhaustive()
