import { gqlFetch } from "#/graphql/fetcher"
import type { PushPlatform } from "#/graphql/generated/graphql"
import {
	RemovePushSubscriptionDocument,
	SavePushSubscriptionDocument,
} from "#/graphql/queries/push"
import { detectDevicePlatform } from "#/lib/device-platform"
import { isStandalone } from "./support"

export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
	return navigator.serviceWorker.register("/sw", {
		scope: "/",
		updateViaCache: "none",
	})
}

// The VAPID key arrives base64url-encoded; subscribe() wants the raw bytes.
export function urlBase64ToUint8Array(
	base64Url: string,
): Uint8Array<ArrayBuffer> {
	const padded = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4))
		.replace(/-/g, "+")
		.replace(/_/g, "/")
	const raw = atob(padded)
	const bytes = new Uint8Array(new ArrayBuffer(raw.length))
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
	return bytes
}

export async function currentSubscription(): Promise<PushSubscription | null> {
	if (!("serviceWorker" in navigator)) return null
	const registration = await navigator.serviceWorker.getRegistration("/")
	return (await registration?.pushManager.getSubscription()) ?? null
}

const PLATFORM: Record<
	ReturnType<typeof detectDevicePlatform>,
	PushPlatform
> = {
	ios: "IOS",
	android: "ANDROID",
	desktop: "DESKTOP",
}

export async function saveSubscription(
	subscription: PushSubscription,
): Promise<boolean> {
	const { endpoint, keys } = subscription.toJSON()
	if (!endpoint || !keys?.p256dh || !keys.auth) return false
	const { savePushSubscription: result } = await gqlFetch(
		SavePushSubscriptionDocument,
		{
			input: {
				endpoint,
				p256dh: keys.p256dh,
				auth: keys.auth,
				platform: PLATFORM[detectDevicePlatform()],
				standalone: isStandalone(),
			},
		},
	)
	return result.__typename === "User"
}

// Whether this key is the one the subscription was made with. A rotated
// server key leaves every existing subscription unable to receive anything.
export function subscribedWithKey(
	subscription: PushSubscription,
	publicKey: string,
): boolean {
	const current = subscription.options.applicationServerKey
	if (!current) return false
	const expected = urlBase64ToUint8Array(publicKey)
	const actual = new Uint8Array(current)
	return (
		actual.length === expected.length &&
		actual.every((byte, i) => byte === expected[i])
	)
}

export type EnableResult = "enabled" | "denied" | "failed"

// MUST be called straight from a click handler, with nothing awaited before
// it: Safari only shows the permission prompt during the user's gesture, and
// any await ahead of requestPermission() loses it. That's why the key is
// fetched ahead of time and passed in.
export async function enablePush(publicKey: string): Promise<EnableResult> {
	const permission = await Notification.requestPermission()
	if (permission !== "granted") return "denied"
	try {
		await registerServiceWorker()
		const registration = await navigator.serviceWorker.ready
		const subscription =
			(await registration.pushManager.getSubscription()) ??
			(await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(publicKey),
			}))
		return (await saveSubscription(subscription)) ? "enabled" : "failed"
	} catch {
		return "failed"
	}
}

export async function disablePush(): Promise<void> {
	const subscription = await currentSubscription()
	if (!subscription) return
	await gqlFetch(RemovePushSubscriptionDocument, {
		endpoint: subscription.endpoint,
	})
	await subscription.unsubscribe()
}
