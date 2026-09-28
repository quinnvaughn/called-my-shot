import type { CallGif } from "./call-gifs"

// What a finished game's entry page shows under its stamp: a perfect card
// (every settled call right) or an oh-fer (every one wrong). See
// gameEntryVerdict in apps/api's lib/game-entry.ts for when each applies.
//
// Same format and hotlinking rules as the call pools - see the header comment
// in ./call-gifs. /admin/gifs checks these under "perfect" and "oh_fer".
export const PERFECT_GIFS: readonly CallGif[] = [
	{
		url: "https://media1.tenor.com/m/HajaxwYE_xUAAAAC/tom-hiddleston-im-so-sorry-im-flawless.gif",
		alt: "Tom Hiddleston saying 'I'm so sorry, I'm flawless.'",
	},
	{
		url: "https://media1.tenor.com/m/iXRv4hsfChsAAAAC/regina-kiss.gif",
		alt: "Regina George from Mean Girls blowing a kiss.",
	},
	{
		url: "https://media1.tenor.com/m/JMr_dlDTHJIAAAAC/theboys-perfect.gif",
		alt: "Homelander from The Boys saying 'Perfect.'",
	},
	{
		url: "https://media1.tenor.com/m/H1-R8Mum3nwAAAAC/perfection-perfect.gif",
		alt: "Michael Fassbender saying 'Perfection.'",
	},
	{
		url: "https://media1.tenor.com/m/rRVAFGcsQVQAAAAd/perfection-on-every-level-bruno-tonioli.gif",
		alt: 'Bruno Tonioli saying "Perfection on every level."',
	},
	{
		url: "https://media1.tenor.com/m/Qo4ZSF7WZFQAAAAC/perfect-sigourney-weaver.gif",
		alt: "Sigourney Weaver saying 'Perfect.'",
	},
	{
		url: "https://media1.tenor.com/m/lIxCSvdMa3sAAAAC/nodding-simon-cowell.gif",
		alt: "Simon Cowell nodding in approval.",
	},
]

export const OH_FER_GIFS: readonly CallGif[] = [
	{
		url: "https://media1.tenor.com/m/ud83mmxrFMEAAAAC/i-suck-chris-farley.gif",
		alt: "Chris Farley saying 'I suck.'",
	},
	{
		url: "https://media1.tenor.com/m/uaBDGOrE_y8AAAAC/the-office-oh-shit.gif",
		alt: "Jim from the Office oh shit face",
	},
	{
		url: "https://media1.tenor.com/m/wHz2J1_ROHwAAAAC/perrie-edwards-smh.gif",
		alt: "Perrie Edwards shaking her head in disappointment.",
	},
	{
		url: "https://media1.tenor.com/m/WVhPulLySwoAAAAC/oh-my-god-i-suck.gif",
		alt: "Stan saying 'Oh my god, I suck.'",
	},
	{
		url: "https://media1.tenor.com/m/kFHjjf0IRhQAAAAd/im-really-bad-at-this-joey-kidney.gif",
		alt: "Joey Kidney saying 'I'm really bad at this.'",
	},
	{
		url: "https://media1.tenor.com/m/IXBnzmnunsYAAAAC/i-missed-it-all-eric-cartman.gif",
		alt: "Eric Cartman saying 'I missed it all.'",
	},
	{
		url: "https://media1.tenor.com/m/G3KZPrfVVikAAAAC/you-missed-a-lot-you-missed-out.gif",
		alt: "A woman saying 'You missed a lot.'",
	},
]
