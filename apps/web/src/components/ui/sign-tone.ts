import { css } from "styled-system/css"

// Each tone is its own literal css() call so Panda's static extraction sees
// every class; a token picked at runtime inside css() would never be emitted.
const gainClass = css({ color: "success.default" })
const lossClass = css({ color: "danger.default" })
const evenClass = css({ color: "fg.default" })
const unknownClass = css({ color: "fg.muted" })

// The color a signed number takes: green above zero, red below, plain at
// zero, muted while there's no number yet. `zeroSign` counts a zero as a gain,
// matching formatSigned's "+0".
export function signTone(
	n: number | null,
	{ zeroSign = false }: { zeroSign?: boolean } = {},
): string {
	if (n === null) return unknownClass
	if (n > 0 || (zeroSign && n === 0)) return gainClass
	if (n < 0) return lossClass
	return evenClass
}
