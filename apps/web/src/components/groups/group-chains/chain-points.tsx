import { css } from "styled-system/css"

const between = css({ color: "fg.default" })

// One points figure, sign and all: green when it's a gain, red when it's a
// loss, white at zero.
function Figure({ points }: { points: number }) {
	return (
		<span
			className={css({
				color:
					points > 0
						? "success.default"
						: points < 0
							? "danger.default"
							: "fg.default",
			})}
		>
			{points > 0 ? "+" : points < 0 ? "−" : ""}
			{Math.abs(points)}
		</span>
	)
}

// A figure, or a range of them when it isn't one exact number yet.
export function ChainPoints({ range }: { range: [number, number] }) {
	const [low, high] = range
	if (low === high) return <Figure points={low} />
	return (
		<>
			<Figure points={low} />
			<span className={between}> to </span>
			<Figure points={high} />
		</>
	)
}

// The arrow between a call's points before and after the chain, in white.
export function ChainPointsArrow() {
	return <span className={between}> → </span>
}
