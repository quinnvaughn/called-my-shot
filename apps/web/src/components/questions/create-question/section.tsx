import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

// The uppercase mono heading above each block of the create-question form,
// with the optional "required" marker on the right.
export function Section({
	label,
	required,
	children,
}: {
	label: string
	required?: boolean
	children: ReactNode
}) {
	return (
		<VStack gap="3" alignItems="stretch">
			<HStack
				justify="space-between"
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					color: "fg.subtle",
					textTransform: "uppercase",
				})}
			>
				<span>{label}</span>
				{required && (
					<span className={css({ color: "fg.subtle" })}>required</span>
				)}
			</HStack>
			{children}
		</VStack>
	)
}
