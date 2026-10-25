import { Tabs } from "#/components/ui/tabs"
import type { CommentSort } from "#/graphql/generated/graphql"

// Most liked first, or newest first.
export function SortToggle({
	value,
	onChange,
}: {
	value: CommentSort
	onChange: (sort: CommentSort) => void
}) {
	return (
		<Tabs value={value} onValueChange={onChange}>
			<Tabs.List variant="pill" aria-label="Order comments by">
				<Tabs.Trigger value="TOP">Most liked</Tabs.Trigger>
				<Tabs.Trigger value="NEWEST">Newest</Tabs.Trigger>
			</Tabs.List>
		</Tabs>
	)
}
