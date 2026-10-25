// The colors a Rushmore prompt without a team can be, picked so the white
// rings, names and title on a share image read on every one. A team's prompt
// is always its team's color. The creator chooses from these; a prompt made
// without choosing gets one from its title (defaultPromptColor), so every
// answer to it shares the color and different prompts look different.

export const PROMPT_COLORS = [
	{ hex: "#1E2E40", name: "Night" },
	{ hex: "#2348A8", name: "Royal" },
	{ hex: "#2F7FB8", name: "Sky" },
	{ hex: "#0F7173", name: "Teal" },
	{ hex: "#1F6B45", name: "Forest" },
	{ hex: "#0E8A5F", name: "Emerald" },
	{ hex: "#B8862B", name: "Gold" },
	{ hex: "#B3283B", name: "Crimson" },
	{ hex: "#6E1F2E", name: "Maroon" },
	{ hex: "#A62B76", name: "Magenta" },
	{ hex: "#5B3A9E", name: "Purple" },
	{ hex: "#3D4A5C", name: "Slate" },
] as const

export type PromptColorHex = (typeof PROMPT_COLORS)[number]["hex"]

export const PROMPT_COLOR_HEXES = PROMPT_COLORS.map((c) => c.hex) as [
	PromptColorHex,
	...PromptColorHex[],
]

// The same color for the same title every time, wherever it's worked out.
export function defaultPromptColor(title: string): PromptColorHex {
	let hash = 2166136261
	for (const char of title.trim().toLowerCase()) {
		hash ^= char.codePointAt(0) ?? 0
		hash = Math.imul(hash, 16777619)
	}
	const index = (hash >>> 0) % PROMPT_COLORS.length
	return PROMPT_COLORS[index]?.hex ?? PROMPT_COLORS[0].hex
}

// The color a prompt's Rushmores are drawn in: its team's, else the one its
// creator chose, else the one its title gives.
export function promptColor(prompt: {
	title: string
	color: string | null
	team: { color: string } | null
}): string {
	return prompt.team?.color ?? prompt.color ?? defaultPromptColor(prompt.title)
}
