import { match } from "ts-pattern"
import type { PushPromptReason } from "#/lib/analytics"

// What notifications would tell this person, given what they just did.
export function reasonCopy(reason: PushPromptReason): string {
	return match(reason)
		.with("call", () => "Get a notification when your calls settle.")
		.with(
			"challenge_created",
			() =>
				"Get a notification when someone accepts your challenge and when it settles.",
		)
		.with(
			"challenge_accepted",
			() => "Get a notification when this challenge settles.",
		)
		.with(
			"chain_started",
			() =>
				"Get a notification when someone asks into your chain and when it holds or breaks.",
		)
		.with(
			"chain_joined",
			() =>
				"Get a notification when your link is answered and when the chain holds or breaks.",
		)
		.with(
			"group_joined",
			() =>
				"Get a notification when people join this group and share calls to it.",
		)
		.exhaustive()
}
