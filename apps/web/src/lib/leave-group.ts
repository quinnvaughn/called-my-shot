// The parts of a membership that decide what leaving does.
type LeavingMember = {
	role: "ADMIN" | "MEMBER"
	joinedAt: string
	user: { username: string }
}

// What leaving does depends on who's left behind: the last member takes the
// group with them, and the last admin hands it to the longest-standing
// member (see leaveGroup).
export function leaveConsequence(
	groupName: string,
	viewer: LeavingMember | undefined,
	others: LeavingMember[],
) {
	if (others.length === 0) {
		return {
			body: `You're the only member, so leaving deletes ${groupName}.`,
			confirmLabel: "Leave and delete",
		}
	}
	const successor = [...others].sort((a, b) =>
		a.joinedAt.localeCompare(b.joinedAt),
	)[0]
	if (viewer?.role === "ADMIN" && !others.some((m) => m.role === "ADMIN")) {
		return {
			body: `You're the only admin, so @${successor.user.username} becomes admin when you leave. Your invite link stops working.`,
			confirmLabel: "Leave group",
		}
	}
	return {
		body: `You'll drop off ${groupName}'s leaderboard and your invite link stops working. Anyone in the group can invite you back.`,
		confirmLabel: "Leave group",
	}
}
