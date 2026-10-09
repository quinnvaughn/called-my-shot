import { Link, useRouteContext } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AccountMenu } from "#/components/app-shell/account-menu"
import { Brand } from "#/components/ui/brand"

const NAV_ITEMS = [
	{ to: "/admin/queue", label: "Queue" },
	{ to: "/admin/questions", label: "Questions" },
	{ to: "/admin/lines", label: "Lines" },
	{ to: "/admin/bands", label: "Bands" },
	{ to: "/admin/leaders", label: "Leaders" },
	{ to: "/admin/titles", label: "Titles" },
	{ to: "/admin/ballots", label: "Ballots" },
	{ to: "/admin/disputes", label: "Disputes" },
	{ to: "/admin/reports", label: "Reports" },
	{ to: "/admin/presser-reports", label: "Presser reports" },
	{ to: "/admin/users", label: "Users" },
	{ to: "/admin/groups", label: "Groups" },
	{ to: "/admin/integrity", label: "Integrity" },
	{ to: "/admin/gifs", label: "Gifs" },
	{ to: "/admin/data", label: "Data" },
] as const

// A deliberately separate shell from AppShell - this is an internal tool for
// admins, not another page of the consumer app, so it doesn't nest inside the
// consumer's own sidebar/nav (the admin route lives outside `_app` for
// exactly this reason - see routes/admin.tsx).
export function AdminShell({ children }: { children: ReactNode }) {
	const { me } = useRouteContext({ from: "/admin" })

	return (
		<div
			className={css({
				display: "flex",
				minHeight: "100dvh",
				bg: "bg.canvas",
			})}
		>
			<VStack
				alignItems="stretch"
				gap="8"
				className={css({
					width: "60",
					flexShrink: 0,
					padding: "{spacing.6} {spacing.5}",
					borderRight: "1px solid {colors.border.default}",
					position: "sticky",
					top: 0,
					height: "100dvh",
				})}
			>
				<VStack alignItems="stretch" gap="4">
					<HStack gap="2.5" paddingInline="1">
						<Brand size="nav" />
					</HStack>
					<span
						className={css({
							alignSelf: "flex-start",
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							textTransform: "uppercase",
							color: "danger.default",
							bg: "danger.default/12",
							padding: "{spacing.1} {spacing.2}",
							borderRadius: "md",
						})}
					>
						Admin
					</span>
					<Link
						to="/home"
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							color: "fg.subtle",
							_hover: { color: "fg.muted" },
						})}
					>
						← Back to app
					</Link>
				</VStack>

				<nav
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "1",
					})}
				>
					{NAV_ITEMS.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							activeProps={{
								className: css({
									bg: "bg.subtle",
									color: "fg.default",
									fontWeight: "semibold",
								}),
							}}
							className={css({
								padding: "{spacing.2.5} {spacing.3}",
								borderRadius: "xl",
								fontSize: "sm",
								color: "fg.subtle",
								fontWeight: "medium",
								_hover: { bg: "fg.default/10", color: "fg.default" },
							})}
						>
							{item.label}
						</Link>
					))}
				</nav>

				<div className={css({ marginTop: "auto" })}>
					{me && (
						<AccountMenu
							name={me.name}
							username={me.username}
							avatarUrl={me.avatarUrl}
							variant="sidebar"
						/>
					)}
				</div>
			</VStack>

			<main
				className={css({
					flex: 1,
					minWidth: 0,
					padding: "{spacing.6} {spacing.8}",
				})}
			>
				{children}
			</main>
		</div>
	)
}
