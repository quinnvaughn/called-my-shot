import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Tag } from "#/components/ui/tag"

export function CurrentEmailRow({
	email,
	emailVerified,
}: {
	email: string
	emailVerified: boolean
}) {
	return (
		<HStack justify="space-between" alignItems="center">
			<VStack gap="0.5" alignItems="flex-start">
				<span
					className={css({
						textStyle: "labelSm",
						color: "fg.muted",
					})}
				>
					Current email
				</span>
				<span className={css({ fontSize: "sm" })}>{email}</span>
			</VStack>
			{emailVerified && (
				<Tag variant="success" size="sm">
					Verified
				</Tag>
			)}
		</HStack>
	)
}
