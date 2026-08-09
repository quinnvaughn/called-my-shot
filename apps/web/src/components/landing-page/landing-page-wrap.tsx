import { css, cx } from "styled-system/css"

type Props = {
	children: React.ReactNode
	className?: string
}

export function LandingPageWrap({ children, className }: Props) {
	return (
		<div
			className={cx(
				css({
					maxWidth: "6xl",
					mx: "auto",
					px: { base: "5", md: "8" },
				}),
				className,
			)}
		>
			{children}
		</div>
	)
}
