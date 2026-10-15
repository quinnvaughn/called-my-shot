import { CHALLENGE_QUESTIONS_MAX } from "@called-my-shot/schemas"
import { Accordion } from "#/components/ui/accordion"
import { B } from "./how-it-works-b"
import { P } from "./how-it-works-p"

export function ChallengesSection({ defaultOpen }: { defaultOpen: boolean }) {
	return (
		<Accordion
			id="challenges"
			title="Challenges"
			subtitle="Your calls against anyone who thinks they can do better"
			defaultOpen={defaultOpen}
		>
			<P>
				Pick up to {CHALLENGE_QUESTIONS_MAX} open questions and share the link.
				Everyone who takes it on plays their own <B>1v1</B> against you: they
				call every question in it, and whoever scores more points across them
				wins. You can share it before you've called anything, but a question you
				never call counts as 0 for you.
			</P>
			<P>
				The link closes when the first question in it locks. Picking the same
				side as the person who made it is allowed. Calls you'd already made on
				those questions count, so you only make the ones you're missing.
			</P>
			<P>
				A 1v1 is scored on <B>challenge points</B>: your normal points with the
				early bonus and season pace taken out, so it comes down to the calls
				themselves. Conviction, price and the contrarian tier still count. Equal
				totals are a draw, a voided question drops out of it, and if a result
				gets overturned, the 1v1 follows.
			</P>
			<P>
				Calls in a challenge still score on the leaderboard as usual. The
				challenge only compares the two of you. Every 1v1 adds to your
				head-to-head record with that person, and the person who made it can see
				how they did against everyone who took it on.
			</P>
			<P>
				Whoever wins gets one <B>trash talk</B>: their own words, a GIF, or
				both. When the person who made the challenge wins, theirs goes to
				everyone they beat. It can't be edited once it's sent, and anyone can
				report it.
			</P>
		</Accordion>
	)
}
