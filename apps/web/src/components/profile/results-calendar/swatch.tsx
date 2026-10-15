import { css, cx } from "styled-system/css"

export function Swatch({ className }: { className: string }) {
	return (
		<span
			className={cx(
				css({
					display: "inline-block",
					width: "3",
					height: "3",
					borderRadius: "xs",
				}),
				className,
			)}
		/>
	)
}
