import { css } from "styled-system/css"

// "MOUNT RUSHMORE" over a prompt's title. Titles are only what it's of
// ("Boston Celtics", "2010s point guards"), so this is what says what the
// thing is, on the post, in a feed and on the prompt's page, the same as the
// share image. Takes the color of whatever it sits on.
export function RushmoreEyebrow() {
	return (
		<span
			className={css({
				display: "block",
				textStyle: "label",
				letterSpacing: "wider",
				opacity: 0.8,
			})}
		>
			Mount Rushmore
		</span>
	)
}
