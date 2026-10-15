import type { ReactNode } from "react"
import { VStack } from "styled-system/jsx"
import { PageHeader } from "#/components/ui/page-header"

// Shared frame for /privacy and /terms: the same prose styling as How It
// Works, laid out as a plain document rather than an accordion, since a policy
// is read top to bottom and has to be linkable and crawlable in full.
export function LegalDocument({
	title,
	effectiveDate,
	children,
}: {
	title: string
	effectiveDate: string
	children: ReactNode
}) {
	return (
		<VStack gap="8" alignItems="stretch" maxWidth="2xl">
			<PageHeader title={title} subtitle={`Effective ${effectiveDate}`} />
			<VStack gap="8" alignItems="stretch">
				{children}
			</VStack>
		</VStack>
	)
}
