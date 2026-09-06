import { builder } from "../../builder"

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
