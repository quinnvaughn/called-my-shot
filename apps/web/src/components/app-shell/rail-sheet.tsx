import type { ReactNode } from "react"
import { Sheet } from "#/components/ui/sheet"

// The page's right rail as a sheet, for screens too narrow to show it beside
// the page. Opened from RailTab.
export function RailSheet({
	title,
	children,
}: {
	title: string
	children: ReactNode
}) {
	return (
		<Sheet>
			<Sheet.Header>
				<Sheet.Title>{title}</Sheet.Title>
				<Sheet.CloseButton />
			</Sheet.Header>
			<Sheet.Body>{children}</Sheet.Body>
		</Sheet>
	)
}
