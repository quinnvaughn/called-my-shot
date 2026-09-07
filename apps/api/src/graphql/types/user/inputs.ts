import { builder } from "../../builder"
import { EmailPreferenceType } from "./enums"

export const UpdateMyNameInput = builder.inputType("UpdateMyNameInput", {
	fields: (t) => ({
		name: t.string({ required: true }),
	}),
})

export const UpdateUsernameInput = builder.inputType("UpdateUsernameInput", {
	fields: (t) => ({
		username: t.string({ required: true }),
	}),
})

export const RequestEmailChangeInput = builder.inputType(
	"RequestEmailChangeInput",
	{
		fields: (t) => ({
			newEmail: t.string({ required: true }),
			password: t.string({ required: true }),
		}),
	},
)

export const UpdatePasswordInput = builder.inputType("UpdatePasswordInput", {
	fields: (t) => ({
		currentPassword: t.string({ required: true }),
		newPassword: t.string({ required: true }),
	}),
})

export const DeleteAccountInput = builder.inputType("DeleteAccountInput", {
	fields: (t) => ({
		password: t.string({ required: true }),
	}),
})

export const SetEmailPreferenceInput = builder.inputType(
	"SetEmailPreferenceInput",
	{
		fields: (t) => ({
			type: t.field({ type: EmailPreferenceType, required: true }),
			// true = send me this, false = mute it. Phrased as the thing the
			// toggle in settings shows rather than as "muted", so the client
			// isn't inverting a boolean on the way in and out.
			enabled: t.boolean({ required: true }),
		}),
	},
)
