import { builder } from "../../builder"

export const GroupRole = builder.enumType("GroupRole", {
	values: {
		ADMIN: { value: "admin" },
		MEMBER: { value: "member" },
	},
})

export const InviteExpiry = builder.enumType("InviteExpiry", {
	values: ["TWENTY_FOUR_HOURS", "SEVEN_DAYS", "NO_EXPIRY"] as const,
})
