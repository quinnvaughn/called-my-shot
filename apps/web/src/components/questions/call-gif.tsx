import {
	type CallGif as CallGifData,
	type CallGifState,
	pickCallGif,
} from "@called-my-shot/scoring"
import { useEffect, useState } from "react"
import { css } from "styled-system/css"

// The reaction to how a call landed, under the result on its record card.
//
// Picks on mount rather than in the route loader, which is the obvious place
// and the wrong one. Loader data is dehydrated into the page and then
// re-derived on a schedule: the router's 30s defaultStaleTime means coming
// back to a call inside half a minute reuses the same pick, and the
// router.invalidate() the dispute and resolve modals call would swap the
// image out from under whoever is looking at it. A mount-time pick is one gif
// per visit, full stop, and it costs nothing here - the og:image carries no
// gif for this to agree with, so the server has no reason to hold an opinion
// about which one a reader gets.
export function CallGif({ state }: { state: CallGifState }) {
	const [gif, setGif] = useState<CallGifData | null>(null)

	useEffect(() => {
		// Nothing can pause an animated gif - not CSS, not an attribute - so
		// the only honest way to respect the preference is to not show one.
		// Free to check here because the pick is already client-side.
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setGif(null)
			return
		}
		setGif(pickCallGif(state))
	}, [state])

	if (!gif) return null

	return (
		<img
			src={gif.url}
			alt={gif.alt}
			loading="lazy"
			decoding="async"
			// The only third-party request this app makes. Sending the call's
			// url along with it would tell the cdn which record someone is
			// looking at, which is nobody's business but ours.
			referrerPolicy="no-referrer"
			// A hotlinked asset can go away without warning. /admin/gifs is how
			// that gets found; this is so a reader never sees a broken-image
			// glyph in the meantime.
			onError={() => setGif(null)}
			// Sized by the gif, not by the card. A fixed box would have to
			// either crop a reaction that is taller than it - and the caption
			// burned into one of these is usually the joke - or letterbox one
			// that is wider. Capping the height and letting the width follow
			// shows the whole frame whatever shape it arrives in.
			className={css({
				display: "block",
				marginInline: "auto",
				width: "auto",
				height: "auto",
				maxWidth: "full",
				maxHeight: "20rem",
				borderRadius: "lg",
			})}
		/>
	)
}
