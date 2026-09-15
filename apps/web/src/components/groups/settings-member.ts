// A group member as the settings page's sections use it: the membership's
// role and join date, flattened onto the user it belongs to.
export type SettingsMember = {
	role: "ADMIN" | "MEMBER"
	joinedAt: string
	user: { id: string; name: string; username: string }
}
