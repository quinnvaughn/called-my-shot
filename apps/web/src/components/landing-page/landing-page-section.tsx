import { css, cx } from "styled-system/css"

type Props = {
	alt?: boolean
	children: React.ReactNode
	id?: string
}

// bg.surface (card white) is the same as bg.canvas (page white) now that the
// theme is light, so it stopped doing anything here - bg.subtle is the token
// that's actually a different color from the page background.
const altStyles = css({
	backgroundColor: "bg.subtle",
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
