import { Tag } from "#/components/ui/tag"

// On a run that stayed on the page through every question.
export function WatchCleanTag({ size = "md" }: { size?: "sm" | "md" }) {
	return (
		<Tag variant="secondary" size={size}>
			Clean run
		</Tag>
	)
}
