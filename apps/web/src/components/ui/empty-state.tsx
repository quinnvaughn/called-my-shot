import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

type EmptyStateProps = {
	children: string
	// Optional CTA below the message - a Link/Button styled via the `button`
	// recipe (see #/components/ui/button). Omitted everywhere except a spot
	// that actually has something useful to point at (e.g. the game detail
	// page's "no other questions yet" pointing at /new-question).
	action?: ReactNode
}

export function EmptyState({ children, action }: EmptyStateProps) {
	return (
		<VStack gap="3" alignItems="center" className={css({ padding: "6" })}>
			<p
				className={css({
					textStyle: "metaLg",
					color: "fg.muted",
					textAlign: "center",
				})}
			>
				{children}
			</p>
			{action}
		</VStack>
	)
}
