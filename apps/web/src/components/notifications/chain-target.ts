import type { Target } from "./notification-shell"

export const chainTarget = (
	chain: { id: string; group: { id: string } | null } | null,
	tab: "chain" | "chat" = "chain",
): Target =>
	chain?.group
		? {
				to: "/groups/$groupId/chains/$chainId",
				params: { groupId: chain.group.id, chainId: chain.id },
				search: { tab },
			}
		: null
