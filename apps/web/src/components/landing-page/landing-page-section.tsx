import { css, cx } from "styled-system/css"

type Props = {
	alt?: boolean
	children: React.ReactNode
	id?: string
}

const altStyles = css({
	backgroundColor: "bg.surface",
	borderTop: "1px solid {border.default}",
	borderBottom: "1px solid {border.default}",
})

export function LandingPageSection({ alt, children, id }: Props) {
	return (
		<div
			id={id}
			className={cx(css({ padding: "{spacing.16} 0" }), alt && altStyles)}
		>
			{children}
		</div>
	)
}
