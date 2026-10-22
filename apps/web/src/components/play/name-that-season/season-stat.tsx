import { css } from "styled-system/css"

export function SeasonStat({ value, label }: { value: string; label: string }) {
	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "1" })}
		>
			<span className={css({ fontFamily: "heading", fontSize: "2xl" })}>
				{value}
			</span>
			<span className={css({ textStyle: "labelSm", color: "fg.muted" })}>
				{label}
			</span>
		</div>
	)
}
