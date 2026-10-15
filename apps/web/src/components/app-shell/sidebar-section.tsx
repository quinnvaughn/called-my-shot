import { type ReactNode, useEffect, useId, useState } from "react"
import { FiChevronDown } from "react-icons/fi"
import { css } from "styled-system/css"

// Collapsed sections are remembered per browser. Open is the default, and
// what the server renders, so a section the reader closed snaps shut once
// the page hydrates.
function storageKey(id: string) {
	return `sidebar-section:${id}`
}

function readCollapsed(id: string): boolean {
	try {
		return localStorage.getItem(storageKey(id)) === "collapsed"
	} catch {
		return false
	}
}

function writeCollapsed(id: string, collapsed: boolean) {
	try {
		if (collapsed) localStorage.setItem(storageKey(id), "collapsed")
		else localStorage.removeItem(storageKey(id))
	} catch {}
}

export function SidebarSection({
	id,
	label,
	children,
}: {
	id: string
	label: string
	children: ReactNode
}) {
	const [open, setOpen] = useState(true)
	const contentId = useId()

	useEffect(() => {
		if (readCollapsed(id)) setOpen(false)
	}, [id])

	function toggle() {
		setOpen((wasOpen) => {
			writeCollapsed(id, wasOpen)
			return !wasOpen
		})
	}

	return (
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "1",
				paddingTop: "3",
				borderTop: "1px solid {colors.border.default}",
			})}
		>
			<button
				type="button"
				aria-expanded={open}
				aria-controls={contentId}
				onClick={toggle}
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					width: "full",
					padding: "{spacing.1.5} {spacing.3}",
					borderRadius: "lg",
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					color: "fg.subtle",
					cursor: "pointer",
					_hover: { bg: "fg.default/10", color: "fg.default" },
				})}
			>
				{label}
				<FiChevronDown
					size={14}
					className={css({
						transition: "transform 0.15s ease",
						transform: open ? "rotate(0deg)" : "rotate(-90deg)",
					})}
				/>
			</button>
			<div
				id={contentId}
				hidden={!open}
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "0.5",
					_hidden: { display: "none" },
				})}
			>
				{children}
			</div>
		</div>
	)
}
