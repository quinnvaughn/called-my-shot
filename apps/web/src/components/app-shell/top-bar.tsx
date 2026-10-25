import { Link } from "@tanstack/react-router"
import { FiBell, FiPlus } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { CreateSheet } from "#/components/create/create-sheet"
import { Brand } from "#/components/ui/brand"
import { Button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"
import { AccountMenu } from "./account-menu"
import type { Me } from "./types"
import { unreadBadge, unreadLabel } from "./unread-badge"

// h 16 is load-bearing: the space rail, the side column and the right rail
// stick just under it (see space-rail.tsx, space-column.tsx and
// app-shell.tsx).
export function TopBar({ me, unreadCount }: { me: Me; unreadCount: number }) {
	// Signed out, making anything starts with an account.
	const createButton = (
		<Button
			variant="solid"
			size="sm"
			aria-label="Create"
			onClick={() =>
				openModal(me ? <CreateSheet /> : <AuthModal defaultView="signup" />)
			}
		>
			<FiPlus size={16} />
			<span className={css({ display: { base: "none", sm: "inline" } })}>
				Create
			</span>
		</Button>
	)

	return (
		<div
			className={css({
				position: "sticky",
				top: 0,
				zIndex: "20",
				bg: "bg.canvas",
				borderBottom: "1px solid {colors.border.default}",
				// The status bar draws over the top of the Home Screen app.
				paddingTop: "env(safe-area-inset-top)",
			})}
		>
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "3",
					height: "16",
					maxWidth: "1728px",
					marginInline: "auto",
					paddingInline: { base: "5", md: "7" },
				})}
			>
				<Link to="/home" aria-label="Home">
					<Brand size="nav" />
				</Link>

				{me ? (
					<HStack gap={{ base: "4", md: "2" }}>
						{createButton}
						<Link
							to="/notifications"
							aria-label={
								unreadCount > 0
									? `Notifications, ${unreadCount} unread`
									: "Notifications"
							}
							activeProps={{
								className: css({ bg: "bg.subtle", color: "fg.default" }),
							}}
							className={css({
								position: "relative",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: "9",
								height: "9",
								borderRadius: "full",
								color: "fg.subtle",
								_hover: { bg: "fg.default/10", color: "fg.default" },
							})}
						>
							<FiBell size={20} />
							{unreadCount > 0 && (
								<span
									aria-hidden
									className={cx(
										unreadBadge,
										css({
											position: "absolute",
											top: "-0.5",
											right: "-1.5",
											border: "2px solid {colors.bg.canvas}",
										}),
									)}
								>
									{unreadLabel(unreadCount)}
								</span>
							)}
						</Link>
						<AccountMenu
							name={me.name}
							username={me.username}
							avatarUrl={me.avatarUrl}
							variant="topbar"
							isAdmin={me.isAdmin}
						/>
					</HStack>
				) : (
					<HStack gap="2">
						{createButton}
						<Button
							variant="outline"
							size="sm"
							onClick={() => openModal(<AuthModal defaultView="signin" />)}
						>
							Log in
						</Button>
						<Button
							variant="solid"
							size="sm"
							onClick={() => openModal(<AuthModal defaultView="signup" />)}
							className={css({ display: { base: "none", sm: "inline-flex" } })}
						>
							Sign up
						</Button>
					</HStack>
				)}
			</div>
		</div>
	)
}
