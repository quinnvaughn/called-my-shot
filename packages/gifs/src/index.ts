// Every gif pool the app draws from, and the draw itself. See the header
// comment in ./call-gifs for why the urls are hotlinked.
export {
	type CallGif,
	type CallGifState,
	GIF_POOLS,
	pickCallGif,
	pickGif,
} from "./call-gifs"
// A finished game's entry page, when it was called all right or all wrong.
export { OH_FER_GIFS, PERFECT_GIFS } from "./game-verdict-gifs"
// The group invite page's gifs. Separate from the call pools, which it
// never draws from.
export { JOIN_GIFS } from "./join-gifs"
