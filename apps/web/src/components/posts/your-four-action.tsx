import { Link } from "@tanstack/react-router"
import { button } from "#/components/ui/button"
import { MakeYoursButton } from "./make-yours-button"

// Beside someone else's Rushmore: the way to make your own for the same
// prompt, or to your own once you have one.
export function YourFourAction({
	code,
	yoursId,
}: {
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
	return <MakeYoursButton code={code} size="sm" />
}
