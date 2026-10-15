import { css } from "styled-system/css"
import { gradeTone } from "#/lib/report-card"

export function GradeText({ grade }: { grade: string }) {
	const tone = gradeTone(grade)
	return (
		<span
			className={
				tone === "success.default"
					? css({ color: "success.default" })
					: tone === "danger.default"
						? css({ color: "danger.default" })
						: css({ color: "fg.default" })
			}
		>
			{grade}
		</span>
	)
}
