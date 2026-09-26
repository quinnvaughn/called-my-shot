import type { CallGif } from "./call-gifs"

// What the group invite page shows above its join button. Its own pool, never
// drawn alongside the call pools in ./call-gifs: a reaction to a result means
// nothing to someone who hasn't joined yet. One pool rather than one per
// state, since the visitor hasn't done anything to react to.
//
// Same format and hotlinking rules as the call pools - see the header comment
// in ./call-gifs. /admin/gifs checks these under the state "join".
export const JOIN_GIFS: readonly CallGif[] = [
	{
		url: "https://media1.tenor.com/m/O2goPYhULw0AAAAC/come-in-come-on-in.gif",
		alt: "Come on in Wayne Brady",
	},
	{
		url: "https://media1.tenor.com/m/PiVnFrktPgIAAAAC/austin-powers-dr-evil.gif",
		alt: "Austin Powers Dr Evil",
	},
	{
		url: "https://media1.tenor.com/m/PyOfs9v3ixwAAAAC/agindebugendelalekomana55.gif",
		alt: "Simpsons Join Us",
	},
	{
		url: "https://media1.tenor.com/m/lvyJz8LUP6AAAAAC/bedtime-chander.gif",
		alt: "Chandler Join Us",
	},
	{
		url: "https://media1.tenor.com/m/PhaN32ImOn0AAAAC/get-in-here-buddy-dwayne-johnson.gif",
		alt: "Get in here buddy Dwayne Johnson",
	},
	{
		url: "https://media1.tenor.com/m/y5QqLDUL1z0AAAAC/come-on-in-charles-haden-savage.gif",
		alt: "Come on in Charles Haden Savage",
	},
	{
		url: "https://media1.tenor.com/m/6EuoEzZN9IwAAAAC/o-brother-where-art-thou-come-on-in-boys.gif",
		alt: "O Brother Where Art Thou Come On In Boys",
	},
]
