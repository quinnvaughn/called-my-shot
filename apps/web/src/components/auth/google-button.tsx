import { useRouterState } from "@tanstack/react-router"
import { useState } from "react"
import { FcGoogle } from "react-icons/fc"
import { css } from "styled-system/css"
import { Button } from "#/components/ui/button"
import type { AuthModalSurface } from "#/lib/auth-modal-copy"
import { startGoogleAuth } from "#/lib/google-auth"
import { LastUsed } from "./last-used"

// One button for both tabs: Google signs an existing account in and creates
// a new one, so which tab someone was on doesn't matter.
//
// A signup here lands back on the page it started from when the caller had
// something to resume there, and on /home otherwise, the same split as the
// email forms' onSuccess. The resumed action itself can't survive the trip
// through Google, only the page it was on.
export function GoogleButton({
	hasOnSuccess,
	surface,
	lastUsed,
}: {
	hasOnSuccess: boolean
	surface: AuthModalSurface
	lastUsed: boolean
}) {
	const href = useRouterState({ select: (s) => s.location.href })
	const [leaving, setLeaving] = useState(false)

	return (
		<LastUsed show={lastUsed}>
			<Button
				type="button"
				variant="outline"
				size="md"
				fullWidth
				loading={leaving}
				disabled={leaving}
				className={css({
					fontFamily: "heading",
					textTransform: "uppercase",
					letterSpacing: "wide",
				})}
				onClick={() => {
					setLeaving(true)
					startGoogleAuth({ surface, returnTo: hasOnSuccess ? href : "/home" })
				}}
			>
				<FcGoogle size={18} />
				Continue with Google
			</Button>
		</LastUsed>
	)
}
