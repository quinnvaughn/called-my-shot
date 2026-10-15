import { FiMenu } from "react-icons/fi"
import { css } from "styled-system/css"

// The round button straddling the sidebar's right edge, md up only (below
// md the sidebar is a drawer with its own open and close). Its tooltip is
// pure CSS: the button only exists where there's a mouse to hover it, and
// keyboard focus shows it too.
export function SidebarToggle({
	collapsed,
	onToggle,
}: {
	collapsed: boolean
	onToggle: () => void
}) {
	const label = collapsed ? "Expand Navigation" : "Collapse Navigation"
	return (
		<button
			type="button"
			aria-label={label}
			aria-expanded={!collapsed}
			onClick={onToggle}
			className={`group ${css({
				display: { base: "none", md: "flex" },
				alignItems: "center",
				justifyContent: "center",
				position: "absolute",
				top: "4",
				right: 0,
				transform: "translateX(50%)",
				zIndex: "10",
				width: "9",
				height: "9",
				borderRadius: "full",
				border: "1px solid {colors.border.default}",
				bg: "bg.canvas",
				color: "fg.subtle",
				cursor: "pointer",
				_hover: { bg: "bg.subtle", color: "fg.default" },
				_focusVisible: {
					outline: "2px solid {colors.primary.default}",
					outlineOffset: "2px",
				},
			})}`}
		>
			<FiMenu size={16} />
			<span
				aria-hidden
				className={css({
					position: "absolute",
					left: "calc(100% + {spacing.2})",
					top: "50%",
					transform: "translateY(-50%)",
					whiteSpace: "nowrap",
					padding: "{spacing.1.5} {spacing.2.5}",
					borderRadius: "md",
					bg: "bg.surface",
					border: "1px solid {colors.border.default}",
					boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
					fontSize: "xs",
					fontWeight: "medium",
					color: "fg.default",
					pointerEvents: "none",
					opacity: 0,
					transition: "opacity 0.15s ease",
					_groupHover: { opacity: 1, transitionDelay: "0.3s" },
					_groupFocusVisible: { opacity: 1 },
				})}
			>
				{label}
			</span>
		</button>
	)
}
