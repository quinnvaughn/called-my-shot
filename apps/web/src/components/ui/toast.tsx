import { useStore } from "@tanstack/react-store"
import { css } from "styled-system/css"
import { toastStore } from "#/stores/toast-store"
import { ToastItem } from "./toast-item"

const stackClass = css({
	position: "fixed",
	zIndex: "toast",
	bottom: "calc({spacing.5} + env(safe-area-inset-bottom))",
	left: "50%",
	transform: "translateX(-50%)",
	width: "calc(100% - 32px)",
	maxWidth: "sm",
	display: "flex",
	flexDirection: "column",
	gap: "2",
	pointerEvents: "none",
})

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
