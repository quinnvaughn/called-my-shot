import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { Card } from "#/components/ui/card"

// One step under a finished game: what it is, why it's worth doing, and the
// button that does it.
export function NextStepCard({
	title,
	body,
	action,
	leading,
}: {
	title: string
	body: string
	action: ReactNode
	leading?: ReactNode
}) {
	return (
		<Card>
			<Card.Body>
				<div
					className={css({
						display: "flex",
						flexDirection: { base: "column", sm: "row" },
						alignItems: { base: "stretch", sm: "center" },
						justifyContent: "space-between",
						gap: "4",
					})}
				>
					<div className={css({ display: "flex", gap: "3", minWidth: 0 })}>
						{leading}
						<div
							className={css({
								display: "flex",
								flexDirection: "column",
								gap: "1",
								minWidth: 0,
							})}
						>
							<h3 className={css({ fontSize: "md", fontWeight: "semibold" })}>
								{title}
							</h3>
							<p className={css({ fontSize: "sm", color: "fg.body" })}>
								{body}
							</p>
						</div>
					</div>
					{action}
				</div>
			</Card.Body>
		</Card>
	)
}
