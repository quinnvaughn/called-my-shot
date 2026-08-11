import { Link } from "@tanstack/react-router"
import { FiMenu, FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { openModal } from "#/stores/modal-store"
import { Brand } from "../ui/brand"
import { Button } from "../ui/button"
import { Dropdown } from "../ui/dropdown"

export function LandingPageNav() {
	return (
		<nav
			className={css({
				position: "sticky",
				top: 0,
				zIndex: 20,
				bg: "bg.surface/88",
				backdropFilter: "blur(10px)",
				borderBottom: "1px solid {colors.border.default}",
			})}
		>
			<div
				className={css({
					maxWidth: "6xl",
					mx: "auto",
					padding: "0 {spacing.8}",
					height: "16",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				})}
			>
				<Link to="/">
					<Brand />
				</Link>
				<HStack
					gap="7"
					alignItems="flex-start"
					className={css({
						fontSize: "sm",
						color: "fg.muted",
						display: { base: "none", lg: "flex" },
					})}
				>
					<Link to="/" hash="how-it-works">
						How It Works
					</Link>
					<Link to="/" hash="question-types">
						Question Types
					</Link>
					<Link to="/" hash="leaderboard">
						Leaderboard
					</Link>
				</HStack>
				<HStack
					alignItems="center"
					gap="4.5"
					className={css({ display: { base: "none", md: "flex" } })}
				>
					<Button
						size="md"
						variant="ghost"
						onClick={() => openModal(<AuthModal defaultView="signin" />)}
					>
						Sign in
					</Button>
					<Button
						variant="solid"
						onClick={() => openModal(<AuthModal defaultView="signup" />)}
					>
						Get Started
					</Button>
				</HStack>
				<Dropdown className={css({ display: { base: "block", md: "none" } })}>
					<Dropdown.Trigger
						aria-label="Menu"
						className={css({
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							width: "8",
							height: "8",
							borderRadius: "lg",
							border: "1px solid",
							borderColor: "border.default",
							color: "fg.default",
							_hover: {
								borderColor: "border.emphasized",
							},
						})}
					>
						{({ open }) => (
							<span
								className={css({
									position: "relative",
									display: "block",
									width: "5",
									height: "5",
								})}
							>
								<FiMenu
									size={20}
									className={css({
										position: "absolute",
										inset: 0,
										transition: "opacity 0.2s ease, transform 0.2s ease",
										opacity: open ? 0 : 1,
										transform: open
											? "rotate(-45deg) scale(0.5)"
											: "rotate(0deg) scale(1)",
									})}
								/>
								<FiX
									size={20}
									className={css({
										position: "absolute",
										inset: 0,
										transition: "opacity 0.2s ease, transform 0.2s ease",
										opacity: open ? 1 : 0,
										transform: open
											? "rotate(0deg) scale(1)"
											: "rotate(45deg) scale(0.5)",
									})}
								/>
							</span>
						)}
					</Dropdown.Trigger>
					<Dropdown.Content>
						<Dropdown.Item
							onClick={() => openModal(<AuthModal defaultView="signin" />)}
						>
							Sign in
						</Dropdown.Item>
						<Dropdown.Item
							variant="primary"
							onClick={() => openModal(<AuthModal defaultView="signup" />)}
						>
							Get Started
						</Dropdown.Item>
					</Dropdown.Content>
				</Dropdown>
			</div>
		</nav>
	)
}
