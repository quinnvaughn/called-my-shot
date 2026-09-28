// The reaction gif a call's record card wears, and the pools it's drawn from.
//
// A package rather than a file in apps/web because the api reads the pools
// too - lib/gif-health.ts walks them to report dead links, and it cannot
// import from apps/web.
//
// The urls are hotlinked straight from Giphy/Tenor. That is a departure from
// how every other image in this app reaches a browser: the share cards are
// rendered by the api and proxied same-origin through /share/*, and
// share-image-panel.tsx went as far as rewriting an <img> into a fetch() to
// keep it that way. Self-hosting was the alternative, and it loses - a
// curated gif is a megabyte or two, sixty of them is a repo that carries
// sixty megabytes of binaries nobody can diff, to replace a joke. The cost is
// that these links can rot, which is why /admin/gifs exists, and that a
// Content-Security-Policy added later has to allow-list the hosts. There is
// no CSP today.
export type CallGifState =
	// Unresolved. A voided question is also unresolved, so it is checked
	// first - see callGifState in apps/web's lib/call-gif.ts.
	| "voided"
	| "pending"
	// An exact numeric guess. Outranks every margin state below, the same way
	// "Nailed it" outranks any margin label in the card's own eyebrow.
	| "nailed"
	// A loss where the pick they walked away from in a redo was the right one.
	// Outranks the loss states below: that is the better story, and it is the
	// whole reason the abandoned pick is kept at all.
	| "should_have_stuck"
	| "never_in_doubt"
	| "by_a_hair"
	| "called_it"
	| "inches_away"
	| "way_off"
	| "missed"

export type CallGif = {
	// Hotlinked - a media.giphy.com / media.tenor.com url that points straight
	// at the asset, not at the page it sits on.
	url: string
	// What the gif shows. Read out to anyone who can't see it, and the column
	// /admin/gifs lists rows by, since a bare cdn url names nothing.
	alt: string
}

// One pool per state. All ten live in one file rather than one file each:
// an entry is a url and a sentence, not a paragraph, and ten short lists are
// easier to keep balanced when they sit next to each other.
//
// An `alt` must not repeat one of the card's own result labels ("Inches
// away", "By a hair", "Never in doubt", "Not close") - the label is already
// a few pixels above the gif, and saying it twice reads as a stutter.
//
// Format:
//   { url: "https://media.giphy.com/media/<id>/giphy.gif", alt: "..." }
//
// An empty pool renders no gif at all rather than falling back to a
// neighbouring one: a state with nothing to say should say nothing, and
// /admin/gifs flags the emptiness so it doesn't go unnoticed.
export const GIF_POOLS: Record<CallGifState, readonly CallGif[]> = {
	voided: [
		{
			url: "https://media1.tenor.com/m/71JBhMVbZToAAAAC/nevermind-rosananadana.gif",
			alt: "Nevermind Rosananadana",
		},
		{
			url: "https://media1.tenor.com/m/AkuKdP92c-cAAAAC/nevermind-nahh.gif",
			alt: "Nevermind Nahh",
		},
		{
			url: "https://media1.tenor.com/m/US0rUoGrwaEAAAAd/never-mibnd.gif",
			alt: "Nevermind",
		},
		{
			url: "https://media1.tenor.com/m/kJ51lkYvc5AAAAAC/never-mind-leaving.gif",
			alt: "Never mind leaving",
		},
		{
			url: "https://media1.tenor.com/m/7nd3-BfjMP4AAAAC/oh-well-then.gif",
			alt: "Oh well then",
		},
		{
			url: "https://media1.tenor.com/m/CFu9sYDGFvgAAAAd/nevermind.gif",
			alt: "Nevermind",
		},
		{
			url: "https://media1.tenor.com/m/vMvR0gEolCEAAAAC/nothing-to-see-here-explosion.gif",
			alt: "Nothing to see here explosion",
		},
		{
			url: "https://media1.tenor.com/m/OtjbBfwQHeIAAAAC/fizzer1k-5597.gif",
			alt: "Nothing to see here MIB",
		},
	],
	pending: [
		{
			alt: "I've got a good feeling about this one Bender Futurama",
			url: "https://media1.tenor.com/m/FM4oxzC1CqUAAAAd/i%27ve-got-a-good-feeling-about-this-bender.gif",
		},
		{
			alt: "I have a good feeling about this one Simon Cowell",
			url: "https://media1.tenor.com/m/4i62-1kV4vEAAAAd/i%27ve-got-a-good-feeling-simon-cowell.gif",
		},
		{
			url: "https://media1.tenor.com/m/KfES_Ko1bjkAAAAd/plums-eastbound-and-down.gif",
			alt: "Plums Eastbound and down",
		},
		{
			url: "https://media1.tenor.com/m/W0jbgIIPyNEAAAAC/trust-the-process.gif",
			alt: "Trust the process",
		},
		{
			url: "https://media1.tenor.com/m/3-Lj6viFuuQAAAAd/you-can-quote-me-on-that-go-back-to-me-for-it.gif",
			alt: "You can quote me on that, go back to me for it",
		},
		{
			url: "https://media1.tenor.com/m/Zqjn--IrpOgAAAAC/mark-my-words-eric-cartman.gif",
			alt: "Mark my words Eric Cartman",
		},
		{
			url: "https://media1.tenor.com/m/OQ2kgprsu9UAAAAd/remember-i-said-that-kaz-crossley.gif",
			alt: "Remember I said that Kaz Crossley",
		},
		{
			url: "https://media1.tenor.com/m/rSEyFVKSl2EAAAAC/waiting-waiting-patiently.gif",
			alt: "Waiting, waiting patiently",
		},
		{
			url: "https://media1.tenor.com/m/LMz_TrIOxV8AAAAd/mr-bean-mrbean.gif",
			alt: "Mr Bean",
		},
		{
			url: "https://media1.tenor.com/m/1ZRQQbxzAvEAAAAC/kermit-kermit-the-frog.gif",
			alt: "Kermit the frog",
		},
	],
	nailed: [
		{
			url: "https://media1.tenor.com/m/8f_pOK97RfQAAAAC/eastbound-and-down-danny-mc-bride.gif",
			alt: "Eastbound and down Danny McBride",
		},
		{
			url: "https://media1.tenor.com/m/7k9aTZwLXg0AAAAC/kermit.gif",
			alt: "Kermit",
		},
		{
			url: "https://media1.tenor.com/m/SWtd_TKfAk0AAAAC/daaaaamn.gif",
			alt: "Daaaaamn",
		},
		{
			url: "https://media1.tenor.com/m/LLLJYVQJNVAAAAAC/chefs-kiss-french-chef.gif",
			alt: "Chef's kiss French chef",
		},
		{
			url: "https://media1.tenor.com/m/K370frua7WgAAAAC/pacha-perfection.gif",
			alt: "Pacha perfection",
		},
		{
			url: "https://media1.tenor.com/m/ZasA9YrSs1gAAAAC/chef%27s-kiss-snoop-dogg.gif",
			alt: "Chef's kiss Snoop Dogg",
		},
		{
			url: "https://media1.tenor.com/m/v2ShFh2q0YoAAAAC/its-perfect-paul-hollywood.gif",
			alt: "It's perfect Paul Hollywood",
		},
		{
			url: "https://media1.tenor.com/m/Lbx415mK-M4AAAAC/michael-scott.gif",
			alt: "Michael Scott",
		},
		{
			url: "https://media1.tenor.com/m/02YT9_QqYYwAAAAC/it-was-perfect.gif",
			alt: "It was perfect",
		},
		{
			url: "https://media1.tenor.com/m/KCjkUfL2anQAAAAd/steph-curry-stephen-curry.gif",
			alt: "Steph Curry",
		},
	],
	should_have_stuck: [
		{
			url: "https://media1.tenor.com/m/jDrq3-or1zgAAAAC/anchorman-the-legend-of-ron-burgundy.gif",
			alt: "Anchorman the legend of Ron Burgundy",
		},
		{
			url: "https://media1.tenor.com/m/UdMH8tT69GgAAAAC/workaholics-regret-doing-that.gif",
			alt: "Workaholics regret doing that",
		},
		{
			url: "https://media1.tenor.com/m/fDYW3HBNi9cAAAAC/parks-and-rec-ron-swanson.gif",
			alt: "Parks and Rec Ron Swanson",
		},
		{
			url: "https://media1.tenor.com/m/3Fh9c-MJfgMAAAAC/regret-drinking.gif",
			alt: "Regret drinking",
		},
		{
			url: "https://media1.tenor.com/m/VBisZgcKBhkAAAAC/homero-simpson.gif",
			alt: "Homer Simpson",
		},
		{
			url: "https://media1.tenor.com/m/ZFc20z8DItkAAAAd/facepalm-really.gif",
			alt: "Facepalm really",
		},
		{
			url: "https://media1.tenor.com/m/lNL_JdVC2XoAAAAC/picard-facepalm.gif",
			alt: "Picard facepalm",
		},
		{
			url: "https://media1.tenor.com/m/HSNIp6CjfIEAAAAd/trust-your-instincts-moira-rose.gif",
			alt: "Trust your instincts Moira Rose",
		},
		{
			url: "https://media1.tenor.com/m/4uL-jvwxESkAAAAd/the-book-of-boba-fett-ahsoka-tano.gif",
			alt: "The Book of Boba Fett Ahsoka Tano",
		},
	],
	never_in_doubt: [
		{
			url: "https://media1.tenor.com/m/1hlTNcVLVS4AAAAC/jordan-shrug.gif",
			alt: "Jordan shrug",
		},
		{
			url: "https://media1.tenor.com/m/g6XJqH3BDmgAAAAd/shrug-mj.gif",
			alt: "Shrug MJ",
		},
		{
			url: "https://media1.tenor.com/m/sJiW8Em95OwAAAAC/avisyulia.gif",
			alt: "I Love Lucy shrug",
		},
		{
			url: "https://media1.tenor.com/m/-LHzJmfwj2kAAAAC/spongebob-too-easy.gif",
			alt: "Spongebob too easy",
		},
		{
			url: "https://media1.tenor.com/m/ERqt8JySSkEAAAAd/danny-mcbride.gif",
			alt: "Danny McBride",
		},
		{
			url: "https://media1.tenor.com/m/PikriR6hauwAAAAC/i-never-doubted-for-a-second-jack-fenton.gif",
			alt: "I never doubted for a second Jack Fenton",
		},
		{
			url: "https://media1.tenor.com/m/Pm3hb6c1VOEAAAAC/star-wars-wrecker.gif",
			alt: "Star Wars Wrecker",
		},
	],
	by_a_hair: [
		{
			url: "https://media1.tenor.com/m/5gOeuHmLaLoAAAAC/spongebob-wipe.gif",
			alt: "Spongebob wipe",
		},
		{
			url: "https://media1.tenor.com/m/F4h332smPMQAAAAd/homelander-billy-butcher.gif",
			alt: "Homelander phew",
		},
		{
			url: "https://media1.tenor.com/m/8iAYsNEEUn0AAAAC/whoa-excuse-me.gif",
			alt: "Whoa excuse me",
		},
		{
			url: "https://media1.tenor.com/m/Li11L5d4GakAAAAC/scrubs-elliot-reid.gif",
			alt: "Scrubs Elliot Reid",
		},
		{
			url: "https://media1.tenor.com/m/CGJPjg-SyswAAAAd/hammaya-relaxed.gif",
			alt: "Mr Bean relaxed",
		},
		{
			url: "https://media1.tenor.com/m/EFVKn1TVfpsAAAAC/tom-tom-and-jerry.gif",
			alt: "Tom Tom and Jerry",
		},
		{
			url: "https://media1.tenor.com/m/k25iMJLY8NEAAAAd/breathe-deeply-james.gif",
			alt: "Breathe deeply James",
		},
		{
			url: "https://media1.tenor.com/m/-XULhgGkqkgAAAAC/dumb-and-dumber-well.gif",
			alt: "Dumb and dumber well",
		},
		{
			url: "https://media1.tenor.com/m/EfMvos4H0toAAAAC/we%27ll-take-it-hubert.gif",
			alt: "We'll take it Hubert",
		},
	],
	called_it: [
		{
			url: "https://media1.tenor.com/m/TbuH_C840NsAAAAC/archer-touching.gif",
			alt: "Archer touching",
		},
		{
			url: "https://media1.tenor.com/m/-IH8MebNtLMAAAAC/tom-behringer-calling-it.gif",
			alt: "Tom Behringer calling it",
		},
		{
			url: "https://media1.tenor.com/m/ZyvK4IM45XwAAAAd/flynn-jatp-jatp-flynn.gif",
			alt: "First of all, called it",
		},
		{
			url: "https://media1.tenor.com/m/1Nc6rtScQEUAAAAd/thats-it-yes-thats-it.gif",
			alt: "That's it, yes, that's it",
		},
		{
			url: "https://media1.tenor.com/m/GRRgybPkpmwAAAAC/shannon-sharpe.gif",
			alt: "Shannon Sharpe",
		},
		{
			url: "https://media1.tenor.com/m/CcqGlkWYOIkAAAAd/happy-dance-dancing.gif",
			alt: "Uncle Phil happy dance",
		},
		{
			url: "https://media1.tenor.com/m/owEZgR02jm4AAAAd/anything-is-possible-kevin-garnett.gif",
			alt: "Anything is possible Kevin Garnett",
		},
	],
	inches_away: [
		{
			url: "https://media1.tenor.com/m/N-QiDZcVCkoAAAAC/so-close.gif",
			alt: "So close",
		},
		{
			url: "https://media1.tenor.com/m/m8PS2R6SOxwAAAAd/this-close-frank-tj-mackey.gif",
			alt: "This close Frank T.J. Mackey",
		},
		{
			url: "https://media1.tenor.com/m/uBBA5GTeGT0AAAAC/state-farm-gotta-be-quicker-than-that.gif",
			alt: "State Farm gotta be quicker than that",
		},
		{
			url: "https://media1.tenor.com/m/bTvfP7JgYg0AAAAC/so-close-i-could-taste-it-near.gif",
			alt: "So close I could taste it near",
		},
		{
			url: "https://media1.tenor.com/m/ftMTXzu5DMEAAAAd/so-close.gif",
			alt: "So close",
		},
		{
			url: "https://media1.tenor.com/m/0kQtk3YHeMoAAAAd/we-were-on-the-verge-of-greatness.gif",
			alt: "We were on the verge of greatness",
		},
	],
	way_off: [
		{
			url: "https://media1.tenor.com/m/pIN8NbJ8nOgAAAAC/right-to-jail.gif",
			alt: "Right to jail",
		},
		{
			url: "https://media1.tenor.com/m/u5uXD3icJ1kAAAAC/simpsons-homer-simpson.gif",
			alt: "Simpsons Homer Simpson",
		},
		{
			url: "https://media1.tenor.com/m/24IeJ4snijMAAAAC/spongebob-spongebob-mocking.gif",
			alt: "Spongebob mocking",
		},
		{
			url: "https://media1.tenor.com/m/yijy9a2Vr8cAAAAC/archer-danger-zone.gif",
			alt: "Archer danger zone",
		},
	],
	missed: [
		{
			url: "https://media1.tenor.com/m/Bn4jqBtt_hgAAAAC/smh-kermit.gif",
			alt: "SMH Kermit",
		},
		{
			url: "https://media1.tenor.com/m/XXoU60m4PEkAAAAd/i-guess-bro-sigma-boy.gif",
			alt: "I guess bro Jonah Hill",
		},
		{
			url: "https://media1.tenor.com/m/jUpHcvLNd0sAAAAd/smh-smh-gif.gif",
			alt: "Steph Curry SMH",
		},
		{
			url: "https://media1.tenor.com/m/0rPL96P7uM0AAAAC/chris-tucker.gif",
			alt: "Chris Tucker SMH",
		},
	],
}

// A random draw from any pool, or null when it is empty.
export function pickGif(pool: readonly CallGif[]): CallGif | null {
	if (pool.length === 0) return null
	return pool[Math.floor(Math.random() * pool.length)] ?? null
}

// Random, and deliberately not a hash of the call id. Nothing else derives a
// gif for the same call - the og:image carries none - so there is no second
// copy that would have to agree with this one, and a record you have already
// read showing a reaction you haven't is the point of putting one here.
export function pickCallGif(state: CallGifState): CallGif | null {
	return pickGif(GIF_POOLS[state])
}
