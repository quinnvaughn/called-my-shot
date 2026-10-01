import { DateTime } from "luxon"
import type { ReactNode } from "react"
import { FiCamera } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { useImagePicker } from "#/components/images/use-image-picker"
import { Avatar } from "#/components/ui/avatar"
import { Button } from "#/components/ui/button"
import { Flair, type FlairData } from "#/components/ui/flair"
import { openModal } from "#/stores/modal-store"
import { EditNameModal } from "./edit-name-modal"

type Props = {
	user: {
		id: string
		name: string
		username: string
		avatarUrl?: string | null
		createdAt: string
		flair?: FlairData | null
	}
	viewerId?: string
	// The profile's share row, beside Edit. Null until there's a record to
	// share.
	share?: ReactNode
}

const avatarButton = css({
	position: "relative",
	flexShrink: 0,
	borderRadius: "full",
	cursor: "pointer",
	_focusVisible: {
		outline: "2px solid {colors.primary.default}",
		outlineOffset: "2px",
	},
})

const cameraBadge = css({
	position: "absolute",
	right: "-0.5",
	bottom: "-0.5",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "6",
	height: "6",
	borderRadius: "full",
	bg: "bg.surface",
	border: "1px solid {colors.border.default}",
	color: "fg.muted",
})

// The viewer's own avatar on their profile opens the picker directly. The
// camera badge is what says it's clickable.
function EditableAvatar({
	name,
	avatarUrl,
}: {
	name: string
	avatarUrl: string | null
}) {
	const picker = useImagePicker({ kind: "avatar" }, "Avatar")
	return (
		<>
			{picker.input}
			<button
				type="button"
				className={avatarButton}
				onClick={picker.pick}
				aria-label={avatarUrl ? "Change avatar" : "Upload avatar"}
			>
				<Avatar size="lg" name={name} src={avatarUrl} />
				<span className={cameraBadge}>
					<FiCamera size={12} />
				</span>
			</button>
		</>
	)
}

export function ProfileHeader({ user, viewerId, share }: Props) {
	const isViewer = viewerId === user.id
	const hasActions = isViewer || Boolean(share)
	return (
		// The actions drop to their own row on a phone, where three share
		// icons and Edit beside the avatar would leave the name no room.
		<div
			className={css({
				display: "flex",
				flexDirection: { base: "column", sm: "row" },
				alignItems: { base: "stretch", sm: "center" },
				gap: { base: "3", sm: "4" },
			})}
		>
			<HStack gap="4" alignItems="center" flex="1" minWidth="0">
				{isViewer ? (
					<EditableAvatar name={user.name} avatarUrl={user.avatarUrl ?? null} />
				) : (
					<Avatar size="lg" name={user.name} src={user.avatarUrl} />
				)}
				<VStack gap="0.5" alignItems="flex-start" flex="1" minWidth="0">
					<HStack gap="2" alignItems="center" minWidth="0" maxWidth="full">
						<span className={css({ fontFamily: "heading", fontSize: "xl" })}>
							{user.name}
						</span>
						{user.flair && <Flair flair={user.flair} size="sm" />}
					</HStack>
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
			</HStack>
			{hasActions && (
				<HStack gap="2" alignItems="center" flexShrink="0">
					{share}
					{isViewer && (
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								openModal(<EditNameModal currentName={user.name} />)
							}
						>
							Edit
						</Button>
					)}
				</HStack>
			)}
		</div>
	)
}
