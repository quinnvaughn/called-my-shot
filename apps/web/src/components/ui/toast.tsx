import { useStore } from "@tanstack/react-store"
import { css, cx } from "styled-system/css"
import { toastStore } from "#/stores/toast-store"
import { ToastItem } from "./toast-item"

const stackClass = css({
	position: "fixed",
	zIndex: "toast",
	left: "50%",
	transform: "translateX(-50%)",
	width: "calc(100% - 32px)",
	maxWidth: "sm",
	display: "flex",
	flexDirection: "column",
	gap: "2",
	pointerEvents: "none",
})
const bottomClass = css({
	bottom:
		"calc({spacing.5} + var(--bottom-nav-height) + var(--bottom-safe-area))",
})
// Under the top bar (h 16 in app-shell/top-bar.tsx).
const topClass = css({ top: "calc({spacing.16} + {spacing.3})" })

// Mounted once at the app root, next to ModalHost. Not portalled and never
// unmounted: a live region has to already be in the DOM when a message is
// added to it, or screen readers skip the announcement. One stack per
// placement, both always mounted for the same reason.
export function ToastHost() {
	const toasts = useStore(toastStore, (state) => state)
	const top = toasts.filter((toast) => toast.placement === "top")
	const bottom = toasts.filter((toast) => toast.placement !== "top")

	return (
		<>
			<output className={cx(stackClass, topClass)} aria-live="polite">
				{top.map((toast) => (
					<ToastItem key={toast.id} toast={toast} />
				))}
			</output>
			<output className={cx(stackClass, bottomClass)} aria-live="polite">
				{bottom.map((toast) => (
					<ToastItem key={toast.id} toast={toast} />
				))}
			</output>
		</>
	)
}
