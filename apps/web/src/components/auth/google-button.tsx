import { useRouterState } from "@tanstack/react-router"
import { useState } from "react"
import { FcGoogle } from "react-icons/fc"
import { css } from "styled-system/css"
import { Button } from "#/components/ui/button"
import type { AuthModalSurface } from "#/lib/auth-modal-copy"
import { startGoogleAuth } from "#/lib/google-auth"
import type { AuthIntent } from "#/stores/auth-intent-store"
import { LastUsed } from "./last-used"

// One button for both tabs: Google signs an existing account in and creates
// a new one, so which tab someone was on doesn't matter.
//
// A signup here lands back on the page it started from when the caller had
// something to resume there, and on /home otherwise, the same split as the
// email forms' onSuccess. A caller whose action can be written down passes it
// as `intent`, and it's finished on the far side of the trip (see
// useGoogleAuthReturn). An action with no intent only gets its page back.
export function GoogleButton({
	hasOnSuccess,
	intent,
	surface,
	lastUsed,
}: {
	hasOnSuccess: boolean
	intent: AuthIntent | null
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
					startGoogleAuth({
						surface,
						returnTo: returnPath(intent, hasOnSuccess, href),
						intent,
					})
				}}
			>
				<FcGoogle size={18} />
				Continue with Google
			</Button>
		</LastUsed>
	)
}

// A group named on the landing page can't come back to "/", which sends a
// signed-in visitor to Home. Spaces, which lists the viewer's groups, is
// where it would have been made in the app, and the resumed creation moves on
// from there to the group.
function returnPath(
	intent: AuthIntent | null,
	hasOnSuccess: boolean,
	href: string,
): string {
	if (intent?.kind === "create_group") return "/spaces"
	return hasOnSuccess ? href : "/home"
}
