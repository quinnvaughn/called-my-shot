import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { AuthModal } from "#/components/auth/auth-modal"
import { Button } from "#/components/ui/button"
import {
	FollowDocument,
	invalidateFollows,
	UnfollowDocument,
} from "#/graphql/follows/mutations"
import type { FollowTargetKind } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { useMe } from "#/hooks/use-me"
import { openModal } from "#/stores/modal-store"
import { showToast } from "#/stores/toast-store"

type Props = {
	kind: FollowTargetKind
	id: string
	following: boolean
	// What's being followed, for the button's accessible name where several
	// sit in one list (the Teams tab, Spaces).
	name: string
}

// Flips the moment it's tapped and puts itself back if the server says no.
// Signed out, it opens sign up instead.
export function FollowButton({ kind, id, following, name }: Props) {
	const me = useMe()
	const queryClient = useQueryClient()
	const follow = useGqlMutation(FollowDocument)
	const unfollow = useGqlMutation(UnfollowDocument)
	// The tap's result until the reads behind `following` catch up.
	const [override, setOverride] = useState<boolean | null>(null)
	const inFlight = useRef(false)
	const shown = override ?? following

	// A fresh value from the server, after this button or another one for the
	// same target, replaces the local one.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on a new server value
	useEffect(() => {
		setOverride(null)
	}, [following])

	async function toggle() {
		if (!me) {
			openModal(<AuthModal defaultView="signup" />)
			return
		}
		if (inFlight.current) return
		inFlight.current = true
		const next = !shown
		setOverride(next)
		try {
			const result = next
				? (await follow.mutateAsync({ kind, id })).follow
				: (await unfollow.mutateAsync({ kind, id })).unfollow
			if (result.__typename !== "FollowPayload") {
				setOverride(!next)
				showToast({ message: result.message })
				return
			}
			setOverride(result.following)
			await invalidateFollows(queryClient)
		} catch {
			setOverride(!next)
			showToast({ message: "Couldn't update that follow. Try again." })
		} finally {
			inFlight.current = false
		}
	}

	return (
		<Button
			variant={shown ? "outline" : "solid"}
			size="sm"
			aria-pressed={shown}
			aria-label={`Follow ${name}`}
			onClick={toggle}
		>
			{shown ? "Following" : "Follow"}
		</Button>
	)
}
