import { useRouteContext } from "@tanstack/react-router"
import type { PropsWithChildren } from "react"
import { css } from "styled-system/css"
import { useRequireAuth } from "#/hooks/use-require-auth"

// Wraps a compound interactive zone (e.g. a multi-control pick flow) that only
// makes sense once signed in. Content stays visible; any click opens the
// sign-up modal instead of reaching the underlying controls. For a single
// action (a button, a submit), use useRequireAuth directly instead.
export function GuestGate({ children }: PropsWithChildren) {
	const { me } = useRouteContext({ from: "__root__" })
	const requireAuth = useRequireAuth()

	if (me) return <>{children}</>

	return (
		<div className={css({ position: "relative" })}>
			{children}
			<button
				type="button"
				aria-label="Sign up to continue"
				onClick={() => requireAuth(() => {})}
				className={css({
					position: "absolute",
					inset: 0,
					width: "full",
					height: "full",
					cursor: "pointer",
				})}
			/>
		</div>
	)
}
