import type { ReactNode } from "react"
import { css } from "styled-system/css"
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

export function LegalSection({
	heading,
	children,
}: {
	heading: string
	children: ReactNode
}) {
	return (
		<VStack as="section" gap="3" alignItems="stretch">
			<h2
				className={css({
					fontFamily: "heading",
					fontSize: "md",
					textTransform: "uppercase",
					letterSpacing: "wide",
					color: "fg.default",
				})}
			>
				{heading}
			</h2>
			{children}
		</VStack>
	)
}

const prose = css({ fontSize: "sm", lineHeight: "relaxed", color: "fg.body" })

export function LegalP({ children }: { children: ReactNode }) {
	return <p className={prose}>{children}</p>
}

export function LegalList({ children }: { children: ReactNode }) {
	return (
		<ul
			className={css({
				fontSize: "sm",
				lineHeight: "relaxed",
				color: "fg.body",
				listStyleType: "disc",
				paddingLeft: "5",
				display: "flex",
				flexDirection: "column",
				gap: "2",
			})}
		>
			{children}
		</ul>
	)
}

export function LegalB({ children }: { children: ReactNode }) {
	return (
		<b className={css({ color: "fg.default", fontWeight: "semibold" })}>
			{children}
		</b>
	)
}

export function SupportEmail() {
	return (
		<a
			href="mailto:support@calledmyshot.com"
			className={css({ color: "fg.default", textDecoration: "underline" })}
		>
			support@calledmyshot.com
		</a>
	)
}
