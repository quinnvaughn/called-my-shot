import type { ReactNode } from "react"
import { css } from "styled-system/css"

// One link in a result's chain strip and the player it leads to. A link
// past par is faded and dashed, so the stretch beyond the shortest route
// shows at a glance; `caption` sits under the player (the par mark).
export function ChainStripStep({
	faded,
	caption,
	children,
}: {
	faded: boolean
	caption?: string | null
	children: ReactNode
}) {
	return (
		<li
			className={css({
				display: "flex",
				alignItems: "center",
				flex: "1",
				minWidth: "0",
			})}
		>
			<span
				aria-hidden
				className={css({
					flex: "1",
					minWidth: "3",
					marginInline: "1",
					borderTop: faded
						? "2px dashed {colors.chain.ink}"
						: "3px solid {colors.chain.ink}",
					opacity: faded ? 0.45 : 1,
				})}
			/>
			<span
				className={css({
					position: "relative",
					display: "flex",
					flexShrink: 0,
					opacity: faded ? 0.6 : 1,
				})}
			>
				{children}
				{caption && (
					<span
						className={css({
							position: "absolute",
							top: "100%",
							left: "50%",
							transform: "translateX(-50%)",
							marginTop: "1",
							textStyle: "labelSm",
							fontWeight: "bold",
							whiteSpace: "nowrap",
						})}
					>
						{caption}
					</span>
				)}
			</span>
		</li>
	)
}
