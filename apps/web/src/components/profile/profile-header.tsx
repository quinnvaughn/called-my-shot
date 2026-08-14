import { DateTime } from "luxon"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { Button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"
import { EditNameModal } from "./edit-name-modal"

type Props = {
	user: { id: string; name: string; username: string; createdAt: string }
	viewerId?: string
}

export function ProfileHeader({ user, viewerId }: Props) {
	const isViewer = viewerId === user.id
	return (
		<HStack gap="4" alignItems="center">
			<Avatar size="lg" name={user.name} />
			<VStack gap="0.5" alignItems="flex-start" flex="1" minWidth="0">
				<span className={css({ fontFamily: "heading", fontSize: "xl" })}>
					{user.name}
				</span>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.subtle",
					})}
				>
					@{user.username}
				</span>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.subtle",
					})}
				>
					Member since {DateTime.fromISO(user.createdAt).toFormat("MMM yyyy")}
				</span>
			</VStack>
			{isViewer && (
				<Button
					variant="outline"
					size="sm"
					onClick={() => openModal(<EditNameModal currentName={user.name} />)}
				>
					Edit
				</Button>
			)}
		</HStack>
	)
}
