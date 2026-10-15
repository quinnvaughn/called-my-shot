import { PromptCta } from "#/components/ui/prompt-cta"
import { openModal } from "#/stores/modal-store"
import { type GloatAudience, GloatModal } from "./gloat-modal"

// The winning side of a fade, offered its one gloat. Same weight and spot as
// FadeCta: once a fade settles, this is the thing the page asks the winner to
// do.
export function GloatCta({ audience }: { audience: GloatAudience }) {
	const prompt =
		audience.kind === "doubters"
			? "You called it."
			: `Your fade on @${audience.username} hit.`
	const sub =
		audience.kind === "doubters"
			? audience.count === 1
				? "Your doubter was wrong. Send them a line."
				: `${audience.count} doubters were wrong. Send them all a line.`
			: "Send them a line."

	return (
		<PromptCta
			prompt={prompt}
			sub={sub}
			action="Gloat"
			onAction={() => openModal(<GloatModal audience={audience} />)}
		/>
	)
}
