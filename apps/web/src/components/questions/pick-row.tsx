import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { PickStateIcon } from "#/components/questions/pick-state-icon"

export function PickRow({
	state,
	image,
	children,
}: {
	state: "win" | "loss" | "pending"
	image?: ReactNode
	children: ReactNode
}) {
	return (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "2.5",
				paddingBlock: "1",
			})}
		>
			<PickStateIcon state={state} />
			{image}
			{children}
		</div>
	)
}
