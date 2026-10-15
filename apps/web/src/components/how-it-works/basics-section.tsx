import { Accordion } from "#/components/ui/accordion"
import { B } from "./how-it-works-b"
import { P } from "./how-it-works-p"

export function BasicsSection() {
	return (
		<Accordion title="The basics" subtitle="Questions vs. calls">
			<P>
				<B>Questions</B> are the prompts: someone asks something, like "Who wins
				the 2027 championship?" <B>Calls</B> are your answer to a question, made
				public under your handle. Every call you make is attached to your track
				record, win or lose.
			</P>
			<P>
				Each league sorts its questions by what they're about, not who asked
				them. <B>Games</B> has every game, and each game's page has the
				questions on it, ours and players'. <B>Season long</B> has questions
				that run the whole season, like stat lines and head-to-heads.{" "}
				<B>Ballots</B> has awards, win totals and titles. Questions from the
				site carry an Official tag.
			</P>
		</Accordion>
	)
}
