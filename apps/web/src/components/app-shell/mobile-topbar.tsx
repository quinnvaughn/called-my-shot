import { FiMenu } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { Brand } from "#/components/ui/brand"
import { Button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"
import { AccountMenu } from "./account-menu"
import type { Me } from "./types"
import { unreadBadge, unreadLabel } from "./unread-badge"

export function MobileTopbar({
	me,
	unreadCount,
	onMenuClick,
}: {
	me: Me
	unreadCount: number
	onMenuClick: () => void
}) {
	return (
		<div
			className={css({
				display: { base: "flex", md: "none" },
				alignItems: "center",
				justifyContent: "space-between",
				position: "sticky",
				top: 0,
				zIndex: "20",
				bg: "bg.canvas",
				borderBottom: "1px solid {colors.border.default}",
				padding: "{spacing.3.5} {spacing.5}",
			})}
		>
			<HStack gap="3">
				<button
					type="button"
					aria-label={
						unreadCount > 0
							? `Open menu, ${unreadCount} unread notifications`
							: "Open menu"
					}
					onClick={onMenuClick}
					className={css({
						position: "relative",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: "8",
						height: "8",
						borderRadius: "lg",
						color: "fg.default",
						cursor: "pointer",
						_hover: { bg: "fg.default/10" },
					})}
				>
					<FiMenu size={20} />
					{/* Notifications live in the drawer, so on a phone this is the
					    only place an unread count can show without opening it. */}
					{unreadCount > 0 && (
						<span
							aria-hidden
							className={cx(
								unreadBadge,
								css({
									position: "absolute",
									top: "-1.5",
									right: "-2",
									border: "2px solid {colors.bg.canvas}",
								}),
							)}
						>
							{unreadLabel(unreadCount)}
						</span>
					)}
				</button>
				<Brand size="nav" />
			</HStack>
			{me ? (
				<AccountMenu
					name={me.name}
					username={me.username}
					avatarUrl={me.avatarUrl}
					variant="topbar"
					isAdmin={me.isAdmin}
				/>
			) : (
				<Button
					variant="solid"
					size="sm"
					onClick={() => openModal(<AuthModal defaultView="signin" />)}
				>
					Log in
				</Button>
			)}
		</div>
	)
}
