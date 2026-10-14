import { env } from "../../env"
import { requireUser } from "../../lib/auth"
import { AuthenticationError, ValidationError } from "../../lib/errors"
import { setPushPreference } from "../../lib/push-prefs"
import { deliverPush, pushConfigured, webPushSend } from "../../lib/push-send"
import {
	isAllowedPushEndpoint,
	loadLiveSubscriptions,
	removePushSubscription,
	savePushSubscription,
} from "../../lib/push-subscriptions"
import { builder } from "../builder"
import { PushPreferenceType } from "./user/enums"
import { UserRef } from "./user/refs"

const PushPlatform = builder.enumType("PushPlatform", {
	values: {
		IOS: { value: "ios" },
		ANDROID: { value: "android" },
		DESKTOP: { value: "desktop" },
	} as const,
})

const SavePushSubscriptionInput = builder.inputType(
	"SavePushSubscriptionInput",
	{
		fields: (t) => ({
			endpoint: t.string({ required: true }),
			p256dh: t.string({ required: true }),
			auth: t.string({ required: true }),
			platform: t.field({ type: PushPlatform, required: true }),
			// Saved from the home-screen app rather than a browser tab.
			standalone: t.boolean({ required: true }),
		}),
	},
)

const SetPushPreferenceInput = builder.inputType("SetPushPreferenceInput", {
	fields: (t) => ({
		// Every type one settings toggle covers.
		types: t.field({ type: [PushPreferenceType], required: true }),
		// true = push me these, false = mute them.
		enabled: t.boolean({ required: true }),
	}),
})

const TestPushResultRef = builder
	.objectRef<{ delivered: number }>("TestPushResult")
	.implement({
		fields: (t) => ({
			// How many of the viewer's devices accepted it.
			delivered: t.exposeInt("delivered"),
		}),
	})

builder.queryFields((t) => ({
	// What the browser subscribes with. Null while push is switched off, which
	// is the web app's cue never to offer it.
	pushPublicKey: t.string({
		nullable: true,
		resolve: () => (pushConfigured() ? (env.VAPID_PUBLIC_KEY ?? null) : null),
	}),
}))

builder.mutationFields((t) => ({
	savePushSubscription: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError, ValidationError],
			directResult: true,
			union: { name: "SavePushSubscriptionResult" },
		},
		args: {
			input: t.arg({ type: SavePushSubscriptionInput, required: true }),
		},
		resolve: async (_root, { input }, ctx) => {
			const user = requireUser(ctx)
			// The device is tied to the session it was saved under, so it needs
			// one - an account only just created inside this request has none yet.
			if (!ctx.sessionId) throw new AuthenticationError()
			if (!isAllowedPushEndpoint(input.endpoint)) {
				throw ValidationError.field(
					"endpoint",
					"That isn't a push service this app sends to.",
				)
			}
			await savePushSubscription(user.id, ctx.sessionId, {
				endpoint: input.endpoint,
				p256dh: input.p256dh,
				auth: input.auth,
				platform: input.platform,
				standalone: input.standalone,
				userAgent: ctx.req.headers["user-agent"]?.slice(0, 500) ?? null,
			})
			return user
		},
	}),

	removePushSubscription: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "RemovePushSubscriptionResult" },
		},
		args: { endpoint: t.arg.string({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			await removePushSubscription(user.id, args.endpoint)
			return user
		},
	}),

	setPushPreference: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "SetPushPreferenceResult" },
		},
		args: { input: t.arg({ type: SetPushPreferenceInput, required: true }) },
		resolve: async (_root, { input }, ctx) => {
			const user = requireUser(ctx)
			await setPushPreference(user.id, input.types, input.enabled)
			return user
		},
	}),

	// Sends a push to every device the viewer has on, so they can see what one
	// looks like and that it arrives.
	sendTestPush: t.field({
		type: TestPushResultRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "SendTestPushResult" },
		},
		resolve: async (_root, _args, ctx) => {
			const user = requireUser(ctx)
			const now = new Date()
			const targets =
				(await loadLiveSubscriptions([user.id], now)).get(user.id) ?? []
			if (targets.length === 0) return { delivered: 0 }
			const { delivered } = await deliverPush(
				targets,
				{
					title: "Notifications are on",
					body: "You'll get one like this when your calls settle.",
					path: "/notifications",
					tag: "test",
					type: "test",
				},
				{ ttl: 60, urgency: "high" },
				webPushSend,
				now,
			)
			return { delivered }
		},
	}),
}))
