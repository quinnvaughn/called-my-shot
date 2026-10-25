import { FiGlobe } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { GroupLogo } from "#/components/ui/group-logo"

const everyoneGlyph = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	flexShrink: 0,
	width: "6",
	height: "6",
	borderRadius: "md",
	bg: "bg.subtle",
	border: "1px solid {colors.border.default}",
	color: "fg.muted",
})

// One audience in the picker, in the trigger and the list alike: a group with
// its logo, or Everyone with a globe the same size so the names line up.
export function AudienceOptionLabel({
	group,
}: {
	group: { name: string; logoUrl?: string | null } | null
}) {
	return (
		<HStack gap="2.5" minWidth="0">
			{group ? (
				<GroupLogo name={group.name} src={group.logoUrl} size="xs" />
			) : (
				<span aria-hidden className={everyoneGlyph}>
					<FiGlobe size={13} />
				</span>
			)}
			<span className={css({ truncate: true })}>
				{group ? group.name : "Everyone"}
			</span>
		</HStack>
	)
}
