import {
	MIN_ACCOUNT_AGE_DAYS,
	MIN_SETTLED_CALLS,
	PRESSER_WINDOW_HOURS,
	STRANGER_QUESTION_CAP,
} from "@called-my-shot/schemas"
import { Accordion } from "#/components/ui/accordion"
import { B } from "./how-it-works-b"
import { P } from "./how-it-works-p"

export function PostGamePressersSection({
	defaultOpen,
}: {
	defaultOpen: boolean
}) {
	return (
		<Accordion
			id="pressers"
			title="Post-game pressers"
			subtitle="Questions about your calls, answered on the record"
			defaultOpen={defaultOpen}
		>
			<P>
				Once a game is final and all your calls on it have settled, you get a{" "}
				<B>presser</B> on your picks page for that game. It's open for{" "}
				{PRESSER_WINDOW_HOURS} hours. You can post one opening statement, and
				people can ask you questions about how the night went.
			</P>
			<P>
				Anyone in a group with you can ask one question. So can anyone else who
				made a call on the same game, once their account is at least{" "}
				{MIN_ACCOUNT_AGE_DAYS} days old with {MIN_SETTLED_CALLS} settled calls,
				up to {STRANGER_QUESTION_CAP} of those per presser. The app asks a few
				of its own too, built from your results: a high-conviction miss, a pick
				almost nobody else made, a redo that switched you onto a miss.
			</P>
			<P>
				A question stays between you and whoever asked it until you answer.
				Answer it, or go with <B>No comment</B>, and the question and your
				answer go public for good. Anything you leave unanswered disappears when
				the presser closes. Answers can't be edited once they're posted.
			</P>
			<P>
				Slurs, threats and anyone's personal details are blocked. Trash talk
				isn't. If something crosses a line, report it from the question's menu.
				You can also block someone from there, and then neither of you can ask
				the other anything.
			</P>
		</Accordion>
	)
}
