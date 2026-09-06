import { builder } from "../../builder"

export const AdminUserSort = builder.enumType("AdminUserSort", {
	values: {
		USERNAME: { value: "username" },
		STRIKES: { value: "strikeCount" },
		VERIFIED: { value: "isVerifiedPundit" },
		CREATION_ENABLED: { value: "questionCreationEnabled" },
	},
})
