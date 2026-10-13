import { useNavigate } from "@tanstack/react-router"
import { FiLogOut, FiSettings, FiShield } from "react-icons/fi"
import { css } from "styled-system/css"
import { Avatar } from "#/components/ui/avatar"
import { Dropdown } from "#/components/ui/dropdown"
import { useSignOut } from "#/hooks/use-sign-out"

type AccountMenuProps = {
	name: string
	username: string
	avatarUrl: string | null
	// "sidebar": full identity chip, menu opens upward (trigger sits at the
	// bottom of the nav column). "topbar": compact avatar-only trigger, menu
	// opens downward (trigger sits in the mobile top bar).
	variant?: "sidebar" | "topbar"
	isAdmin?: boolean
}

const itemRow = css({ display: "flex", alignItems: "center", gap: "2" })

export function AccountMenu({
	name,
	username,
	avatarUrl,
	variant = "sidebar",
	isAdmin = false,
}: AccountMenuProps) {
	const { signOut } = useSignOut()
	const navigate = useNavigate()

	return (
		<Dropdown
			className={css({ width: variant === "sidebar" ? "full" : "auto" })}
		>
			{variant === "sidebar" ? (
				<Dropdown.Trigger
					aria-label="Account menu"
					className={css({
						display: "flex",
						alignItems: "center",
						width: "full",
						borderRadius: "2xl",
						justifyContent: "flex-start",
						gap: "2.5",
						padding: "2.5",
						_hover: { bg: "fg.default/10" },
					})}
				>
					<Avatar name={name} src={avatarUrl} />
					<div className={css({ minWidth: 0, textAlign: "left" })}>
						<div
							className={css({
								fontSize: "sm",
								fontWeight: "medium",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							})}
						>
							{name}
						</div>
						<div
							className={css({
								fontFamily: "mono",
								fontSize: "3xs",
								color: "fg.muted",
							})}
						>
							@{username}
						</div>
					</div>
				</Dropdown.Trigger>
			) : (
				<Dropdown.Trigger aria-label="Account menu">
					<Avatar name={name} size="sm" src={avatarUrl} />
				</Dropdown.Trigger>
			)}
			<Dropdown.Content
				placement={variant === "sidebar" ? "top" : "bottom"}
				className={css(variant === "sidebar" ? { width: "full" } : undefined)}
			>
				{variant === "topbar" && (
					<>
						<div className={css({ padding: "{spacing.1} {spacing.2.5}" })}>
							<div
								className={css({
									fontSize: "sm",
									fontWeight: "medium",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								})}
							>
								{name}
							</div>
							<div
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									color: "fg.muted",
								})}
							>
								@{username}
							</div>
						</div>
						<div
							className={css({
								borderTop: "1px solid {colors.border.default}",
								marginBlock: "1",
							})}
						/>
					</>
				)}
				<Dropdown.Item onClick={() => void navigate({ to: "/settings" })}>
					<span className={itemRow}>
						<FiSettings size={14} />
						Settings
					</span>
				</Dropdown.Item>
				{isAdmin && (
					<Dropdown.Item onClick={() => void navigate({ to: "/admin" })}>
						<span className={itemRow}>
							<FiShield size={14} />
							Admin
						</span>
					</Dropdown.Item>
				)}
				<div
					className={css({
						borderTop: "1px solid {colors.border.default}",
						marginBlock: "1",
					})}
				/>
				<Dropdown.Item onClick={signOut}>
					<span className={itemRow}>
						<FiLogOut size={14} />
						Log out
					</span>
				</Dropdown.Item>
			</Dropdown.Content>
		</Dropdown>
	)
}
