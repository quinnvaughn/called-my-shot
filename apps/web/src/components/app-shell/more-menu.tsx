import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { FaQuestion } from "react-icons/fa"
import {
	FiChevronDown,
	FiChevronUp,
	FiLifeBuoy,
	FiUserPlus,
	FiZap,
} from "react-icons/fi"
import { HiDotsCircleHorizontal } from "react-icons/hi"
import type { IconType } from "react-icons/lib"
import { css } from "styled-system/css"
import { Dropdown } from "#/components/ui/dropdown"

// Account things (settings, admin) live in the account menu, replaying the
// walkthrough in settings, and How It Works and the legal pages in the landing
// page footer.
type MoreMenuProps = {
	signedIn: boolean
	// Closes the mobile drawer the menu lives in once an item is picked.
	onNavigate: () => void
}

export function MoreMenu({ signedIn, onNavigate }: MoreMenuProps) {
	const navigate = useNavigate()
	const [expanded, setExpanded] = useState(false)

	function go(to: string) {
		onNavigate()
		void navigate({ to })
	}

	type Item = {
		label: string
		icon: IconType
		onSelect: () => void
	}
	const items: Item[] = [
		...(signedIn
			? [
					{
						label: "My Questions",
						icon: FaQuestion,
						onSelect: () => go("/my-questions"),
					},
					{
						label: "Invite a Friend",
						icon: FiUserPlus,
						onSelect: () => go("/invite"),
					},
				]
			: []),
		{
			label: "Updates",
			icon: FiZap,
			onSelect: () => go("/updates"),
		},
		...(signedIn
			? [
					{
						label: "Support",
						icon: FiLifeBuoy,
						onSelect: () => go("/support"),
					},
				]
			: []),
	]

	return (
		<>
			<Dropdown
				className={css({
					width: "full",
					display: { base: "none", md: "block" },
				})}
			>
				<Dropdown.Trigger aria-label="More" className={rowClass}>
					<HiDotsCircleHorizontal size={20} />
					More
				</Dropdown.Trigger>
				<Dropdown.Content placement="bottom" className={css({ width: "full" })}>
					{items.map((item) => (
						<Dropdown.Item key={item.label} onClick={item.onSelect}>
							<span
								className={css({
									display: "flex",
									alignItems: "center",
									gap: "2",
								})}
							>
								<item.icon size={14} />
								{item.label}
							</span>
						</Dropdown.Item>
					))}
				</Dropdown.Content>
			</Dropdown>

			{/* The drawer is already a list of rows, so More just extends it
			    rather than opening a menu on top of a menu. */}
			<div
				className={css({
					display: { base: "flex", md: "none" },
					flexDirection: "column",
					gap: "1",
				})}
			>
				<button
					type="button"
					aria-expanded={expanded}
					onClick={() => setExpanded((open) => !open)}
					className={rowClass}
				>
					<HiDotsCircleHorizontal size={20} />
					More
					<span className={css({ marginLeft: "auto", display: "flex" })}>
						{expanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
					</span>
				</button>
				{expanded &&
					items.map((item) => (
						<button
							key={item.label}
							type="button"
							onClick={item.onSelect}
							className={rowClass}
						>
							<item.icon size={20} />
							{item.label}
						</button>
					))}
			</div>
		</>
	)
}

// Matches the sidebar's nav links so More and its rows read as part of the
// same list.
const rowClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "flex-start",
	gap: "3.5",
	width: "full",
	padding: "{spacing.2.5} {spacing.3}",
	borderRadius: "xl",
	fontSize: "sm",
	color: "fg.subtle",
	fontWeight: "medium",
	cursor: "pointer",
	_hover: { bg: "fg.default/10", color: "fg.default" },
})
