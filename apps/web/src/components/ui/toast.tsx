import { Link } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import { FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { dismissToast, type Toast, toastStore } from "#/stores/toast-store"

const stackClass = css({
	position: "fixed",
	zIndex: "toast",
	bottom: "5",
	left: "50%",
	transform: "translateX(-50%)",
	width: "calc(100% - 32px)",
	maxWidth: "sm",
	display: "flex",
	flexDirection: "column",
	gap: "2",
	pointerEvents: "none",
})

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
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "primary.default",
	_hover: { textDecoration: "underline" },
})

function ToastItem({ toast }: { toast: Toast }) {
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

// Mounted once at the app root, next to ModalHost. Not portalled and never
// unmounted: a live region has to already be in the DOM when a message is
// added to it, or screen readers skip the announcement.
export function ToastHost() {
	const toasts = useStore(toastStore, (state) => state)

	return (
		<output className={stackClass} aria-live="polite">
			{toasts.map((toast) => (
				<ToastItem key={toast.id} toast={toast} />
			))}
		</output>
	)
}
