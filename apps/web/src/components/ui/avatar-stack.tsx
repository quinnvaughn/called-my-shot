import { HStack } from "styled-system/jsx"
import { Avatar, avatarStyle } from "./avatar"

type AvatarStackMember = {
	id: string
	name: string
}

type AvatarStackProps = {
	members: AvatarStackMember[]
	max?: number
	size?: "xs" | "sm" | "md"
}

export function AvatarStack({
	members,
	max = 5,
	size = "xs",
}: AvatarStackProps) {
	const visible = members.slice(0, max)
	const overflow = members.length - visible.length

	return (
		<HStack gap="1">
			{visible.map((m) => (
				<Avatar size={size} key={m.id} name={m.name} />
			))}
			{overflow > 0 && <div className={avatarStyle({ size })}>+{overflow}</div>}
		</HStack>
	)
}
