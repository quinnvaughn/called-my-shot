import { useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"
import { PushPublicKeyDocument } from "#/graphql/queries/push"
import { gqlQueryOptions } from "#/graphql/query-options"
import { currentSubscription } from "#/lib/push/client"
import {
	type PushAvailability,
	pushAvailability,
	readPushEnvironment,
} from "#/lib/push/support"

export const pushPublicKeyQuery = gqlQueryOptions(
	PushPublicKeyDocument,
	{},
	{ staleTime: Number.POSITIVE_INFINITY },
)

export type PushState = {
	// False until the browser has been read, which only happens after
	// hydration. Nothing push-related renders before then.
	ready: boolean
	availability: PushAvailability
	permission: NotificationPermission | "unsupported"
	// Whether this browser holds a subscription right now.
	subscribed: boolean
	// Null while the api has push switched off.
	publicKey: string | null
	refresh: () => void
}

// What this device can do about push, re-read whenever the page comes back
// into view: permission can be changed in system settings while the app is
// in the background.
export function usePushState(): PushState {
	const { data } = useQuery(pushPublicKeyQuery)
	const [state, setState] = useState<Omit<PushState, "publicKey" | "refresh">>({
		ready: false,
		availability: "unsupported",
		permission: "unsupported",
		subscribed: false,
	})

	const refresh = useCallback(() => {
		const availability = pushAvailability(readPushEnvironment())
		const permission =
			"Notification" in window ? Notification.permission : "unsupported"
		void currentSubscription()
			.catch(() => null)
			.then((subscription) =>
				setState({
					ready: true,
					availability,
					permission,
					subscribed: subscription !== null && permission === "granted",
				}),
			)
	}, [])

	useEffect(() => {
		refresh()
		const onVisible = () => {
			if (document.visibilityState === "visible") refresh()
		}
		document.addEventListener("visibilitychange", onVisible)
		return () => document.removeEventListener("visibilitychange", onVisible)
	}, [refresh])

	return { ...state, publicKey: data?.pushPublicKey ?? null, refresh }
}
