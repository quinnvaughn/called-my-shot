import { Link } from "@tanstack/react-router"
import { FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { dismissToast, type Toast } from "#/stores/toast-store"

const toastClass = css({
	pointerEvents: "auto",
	display: "flex",
	alignItems: "flex-start",
	gap: "3",
	bg: "bg.surface",
	border: "1px solid {colors.border.emphasized}",
	borderRadius: "xl",
	paddingBlock: "3",
	paddingInline: "4",
	boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
	animation: "toastIn 0.15s ease",
})

const actionClass = css({
	textStyle: "label",
	color: "primary.default",
	_hover: { textDecoration: "underline" },
})

export function ToastItem({ toast }: { toast: Toast }) {
	return (
		<div className={toastClass}>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "flex-start",
					gap: "1.5",
					flex: "1",
					minWidth: "0",
				})}
			>
				<p
					className={css({
						fontSize: "sm",
						lineHeight: "relaxed",
						color: "fg.default",
					})}
				>
					{toast.message}
				</p>
				{toast.action && (
					<Link
						to={toast.action.to}
						hash={toast.action.hash}
						className={actionClass}
						onClick={() => dismissToast(toast.id)}
					>
						{toast.action.label}
					</Link>
				)}
			</div>
			<button
				type="button"
				aria-label="Dismiss"
				onClick={() => dismissToast(toast.id)}
				className={css({
					color: "fg.muted",
					cursor: "pointer",
					flexShrink: 0,
					marginTop: "0.5",
					_hover: { color: "fg.default" },
				})}
			>
				<FiX size={14} />
			</button>
		</div>
	)
}
