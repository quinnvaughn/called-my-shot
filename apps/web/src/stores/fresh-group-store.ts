// The group this tab just created, until its page has opened the invite modal
// for it. A brand new group has one member and nothing on its board yet, so
// the invite link is the next thing to do. Module state rather than storage:
// it only has to last from the creation to the navigation it causes.
let freshGroupId: string | null = null

export function markFreshGroup(groupId: string) {
	freshGroupId = groupId
}

// True once, on the first look from that group's page.
export function takeFreshGroup(groupId: string): boolean {
	if (freshGroupId !== groupId) return false
	freshGroupId = null
	return true
}
