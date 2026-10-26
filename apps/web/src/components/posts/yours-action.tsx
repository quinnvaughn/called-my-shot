import { Link } from "@tanstack/react-router"
import { button } from "#/components/ui/button"
import type { PostKind } from "#/lib/post-kind"
import { MakeYoursButton } from "./make-yours-button"

// Beside someone else's post: the way to make your own for the same prompt,
// or to your own once you have one.
export function YoursAction({
	kind,
	code,
	yoursId,
}: {
	kind: PostKind
	code: string
	// The viewer's public answer to the prompt, if they've made one.
	yoursId: string | null
}) {
	if (yoursId) {
		return (
			<Link
				to="/posts/$postId"
				params={{ postId: yoursId }}
				className={button({ variant: "outline", size: "sm" })}
			>
				See yours
			</Link>
		)
	}
	return <MakeYoursButton kind={kind} code={code} size="sm" />
}
