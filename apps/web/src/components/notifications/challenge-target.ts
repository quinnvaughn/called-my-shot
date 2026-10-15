import type { Target } from "./notification-shell"

export const challengeTarget = (challenge: { code: string } | null): Target =>
	challenge
		? { to: "/challenges/$code", params: { code: challenge.code } }
		: null
