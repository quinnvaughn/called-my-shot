// The service worker, served at /sw by routes/sw.ts. Plain JS, not
// bundled: it runs in its own worker scope, outside the app.
//
// Push only. There is deliberately no fetch handler: the app is server
// rendered and its chunks are content-hashed, and caching either here would
// fight the stale-build guard (hooks/use-stale-build-guard.ts) for which
// version a returning visitor runs.

self.addEventListener("install", () => {
	self.skipWaiting()
})

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim())
})

// Always shows something, even for a payload it can't read: Safari revokes
// the subscription of a site whose pushes arrive without a notification.
self.addEventListener("push", (event) => {
	let data = {}
	try {
		data = event.data ? event.data.json() : {}
	} catch {
		data = {}
	}
	const title = data.title || "Called My Shot"
	event.waitUntil(
		self.registration.showNotification(title, {
			body: data.body || "",
			tag: data.tag,
			icon: "/android-chrome-192x192.png",
			badge: "/android-chrome-192x192.png",
			data: {
				url: data.url || "/notifications",
				notificationIds: Array.isArray(data.notificationIds)
					? data.notificationIds
					: [],
			},
		}),
	)
})

// Tapping a push is seeing what it announced, so its notifications are
// marked read alongside opening it rather than waiting for a visit to the
// inbox. Open tabs are told once it lands so their unread badge catches up.
async function markRead(ids) {
	if (ids.length === 0) return
	try {
		await fetch("/graphql", {
			method: "POST",
			credentials: "include",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				query:
					"mutation ($ids: [ID!]!) { markPushRead(ids: $ids) { __typename } }",
				variables: { ids },
			}),
		})
	} catch {
		return
	}
	const windows = await self.clients.matchAll({ type: "window" })
	for (const client of windows) client.postMessage({ type: "notifications-read" })
}

// Opens what the notification is about: in a tab of the app that's already
// open if there is one (the app navigates itself, see usePushSync), otherwise
// in a new one.
async function openUrl(url) {
	const windows = await self.clients.matchAll({
		type: "window",
		includeUncontrolled: true,
	})
	const open = windows.find(
		(client) => new URL(client.url).origin === self.location.origin,
	)
	if (open) {
		await open.focus()
		open.postMessage({ type: "navigate", url })
		return
	}
	await self.clients.openWindow(url)
}

self.addEventListener("notificationclick", (event) => {
	event.notification.close()
	const data = event.notification.data ?? {}
	const url = new URL(data.url || "/notifications", self.location.origin).href
	event.waitUntil(
		Promise.all([openUrl(url), markRead(data.notificationIds ?? [])]),
	)
})

// A browser that rotates a subscription on its own. Re-subscribes with the
// same key and hands the new one to the api under whoever is signed in; the
// app also re-saves on every visit (usePushSync), which covers browsers that
// never fire this.
self.addEventListener("pushsubscriptionchange", (event) => {
	event.waitUntil(
		(async () => {
			const key = event.oldSubscription?.options?.applicationServerKey
			if (!key) return
			const subscription = await self.registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: key,
			})
			const json = subscription.toJSON()
			await fetch("/graphql", {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					query:
						"mutation ($input: SavePushSubscriptionInput!) { savePushSubscription(input: $input) { __typename } }",
					variables: {
						input: {
							endpoint: json.endpoint,
							p256dh: json.keys.p256dh,
							auth: json.keys.auth,
							platform: /iPhone|iPad|iPod/.test(navigator.userAgent)
								? "IOS"
								: /Android/.test(navigator.userAgent)
									? "ANDROID"
									: "DESKTOP",
							standalone: false,
						},
					},
				}),
			})
		})(),
	)
})
