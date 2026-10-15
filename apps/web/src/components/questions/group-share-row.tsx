import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { GroupLogo } from "#/components/ui/group-logo"
import { pluralize } from "#/lib/pluralize"

export function GroupShareRow({
	name,
	logoUrl,
	memberCount,
	alreadyShared,
	pending,
	disabled,
	onShare,
	pin,
}: {
	name: string
	logoUrl: string | null
	memberCount: number
	alreadyShared: boolean
	pending: boolean
	disabled: boolean
	onShare: () => void
	// Admins only: pins the question to the top of the group page, or
	// unpins it.
	pin: { pinned: boolean; onToggle: () => void } | null
}) {
	return (
		<HStack
			justify="space-between"
			gap="3"
			className={css({
				paddingBlock: "2.5",
				borderBottom: "1px solid {colors.border.default}",
				_last: { borderBottom: "none" },
			})}
		>
			<HStack gap="2.5" alignItems="center" minWidth="0">
				<GroupLogo size="sm" name={name} src={logoUrl} />
				<VStack
					gap="0.5"
					alignItems="flex-start"
					className={css({ minWidth: 0 })}
				>
					<span
						className={css({
							fontSize: "sm",
							truncate: true,
							maxWidth: "full",
						})}
					>
						{name}
					</span>
					<span
						className={css({
							textStyle: "meta",
							color: "fg.subtle",
						})}
					>
						{memberCount} {pluralize(memberCount, "member")}
					</span>
				</VStack>
			</HStack>
			<HStack gap="2" flexShrink="0">
				{pin && (
					<Button
						variant={pin.pinned ? "ghost" : "outline"}
						size="sm"
						disabled={disabled}
						onClick={pin.onToggle}
					>
						{pin.pinned ? "Unpin" : "Pin"}
					</Button>
				)}
				{alreadyShared ? (
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							color: "success.default",
							whiteSpace: "nowrap",
						})}
					>
						✓ Shared
					</span>
				) : (
					<Button
						variant="outline"
						size="sm"
						loading={pending}
						disabled={disabled}
						onClick={onShare}
					>
						Share
					</Button>
				)}
			</HStack>
		</HStack>
	)
}
