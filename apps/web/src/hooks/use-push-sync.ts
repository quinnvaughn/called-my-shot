import { useQuery } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"
import {
	currentSubscription,
	enablePush,
	registerServiceWorker,
	saveSubscription,
	subscribedWithKey,
} from "#/lib/push/client"
import { pushPublicKeyQuery } from "./use-push-state"

const SYNCED_KEY = "cms.pushSynced"

// Keeps this device's subscription filed under whoever is signed in, once per
// browser session: a device is tied to the session it was saved under, so
// signing back in after signing out (or after a session expires) would
// otherwise leave it pushing to no one. Also re-subscribes after a server key
// change, and follows a tapped notification into an already-open tab.
export function usePushSync(userId: string | null) {
	const router = useRouter()
	const { data } = useQuery({ ...pushPublicKeyQuery, enabled: Boolean(userId) })
	const publicKey = data?.pushPublicKey ?? null

	useEffect(() => {
		if (!("serviceWorker" in navigator)) return
		const onMessage = (event: MessageEvent) => {
			if (event.data?.type !== "navigate" || typeof event.data.url !== "string")
				return
			const url = new URL(event.data.url, window.location.origin)
			if (url.origin !== window.location.origin) return
			void router.navigate({ href: `${url.pathname}${url.search}${url.hash}` })
		}
		navigator.serviceWorker.addEventListener("message", onMessage)
		return () =>
			navigator.serviceWorker.removeEventListener("message", onMessage)
	}, [router])

	useEffect(() => {
		if (!userId || !publicKey || !("serviceWorker" in navigator)) return
		if (!("Notification" in window) || Notification.permission !== "granted")
			return
		void (async () => {
			await registerServiceWorker()
			const subscription = await currentSubscription()
			if (!subscription) return
			if (!subscribedWithKey(subscription, publicKey)) {
				await subscription.unsubscribe()
				// Permission is already granted, so no prompt appears here.
				await enablePush(publicKey)
				return
			}
			const marker = `${userId}:${subscription.endpoint}`
			try {
				if (sessionStorage.getItem(SYNCED_KEY) === marker) return
			} catch {}
			if (await saveSubscription(subscription)) {
				try {
					sessionStorage.setItem(SYNCED_KEY, marker)
				} catch {}
			}
		})().catch(() => {})
	}, [userId, publicKey])
}
