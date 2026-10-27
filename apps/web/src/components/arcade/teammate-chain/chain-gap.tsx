import { css } from "styled-system/css"

// The open stretch between the chain so far and the target while a game is
// going: a dashed line, and how many links the chain has used against par.
export function ChainGap({ links, par }: { links: number; par: number }) {
	return (
		<div className={css({ display: "flex", gap: "3", paddingInline: "3" })}>
			<span
				aria-hidden
				className={css({
					width: "10",
					display: "flex",
					justifyContent: "center",
					flexShrink: 0,
				})}
			>
				<span
					className={css({
						height: "10",
						borderLeft: "2px dashed {colors.border.emphasized}",
					})}
				/>
			</span>
			<span
				className={css({
					alignSelf: "center",
					textStyle: "labelSm",
					color: "fg.muted",
				})}
			>
				{links === 0
					? `Not connected yet · par is ${par} links`
					: `${links} ${links === 1 ? "link" : "links"} so far · par is ${par}`}
			</span>
		</div>
	)
}
