// Real token values from apps/web/panda.config.ts's dark palette. Neither
// satori (share cards) nor an email client can read the app's actual CSS
// variables, so both have to inline literal hex - this is the one hand-copied
// transcription they share, rather than a separate near-identical map per
// consumer drifting to two different oranges.
//
// The app is dark-only, so there is no light variant to pick between here.
export const COLOR = {
	paper: "#0B0B0C", // bg.canvas
	card: "#151513", // bg.surface
	cardMuted: "#1B1B18", // bg.subtle
	border: "#2A2A28", // border.default
	borderEmphasized: "#3E3E3A", // border.emphasized
	ink: "#F5F1E8", // fg.default
	linen: "#D8D4C9", // fg.body
	dim: "#8A8A84", // fg.muted
	steel: "#96938A", // fg.subtle
	primaryDefault: "#FF5A1F", // primary.default
	primarySubtle: "#3A1E12", // primary.subtle
	secondary: "#6AC0FF", // secondary.default
	secondarySubtle: "#162633", // secondary.subtle
	// Only for a call that actually landed, or performance that's genuinely
	// good - anything that merely happened takes `secondary` instead.
	success: "#34D399", // success.default (and success.vibrant, same value)
	successSubtle: "#112921", // success.subtle
	danger: "#E24B4A", // danger.default
	dangerSubtle: "#2E1616", // danger.subtle
}
