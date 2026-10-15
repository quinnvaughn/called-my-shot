import { css, cx } from "styled-system/css"
import { signTone } from "#/components/ui/sign-tone"
import { formatSigned } from "#/lib/format-number"

type Props = {
	value: number
	// Writes a zero as "+0" and colors it as a gain.
	zeroSign?: boolean
	// Trailing unit, e.g. " pts".
	suffix?: string
	// A tinted chip, for a result that sits on its own beside other content.
	pill?: boolean
	className?: string
}

const pillClass = css({
	textStyle: "metaLg",
	fontWeight: "bold",
	whiteSpace: "nowrap",
	padding: "{spacing.1} {spacing.2.5}",
	borderRadius: "sm",
})
const gainPillClass = css({ backgroundColor: "success.subtle" })
const lossPillClass = css({ backgroundColor: "danger.subtle" })
const evenPillClass = css({ backgroundColor: "bg.subtle" })

// A points total with its sign and the color that goes with it.
export function SignedPoints({
	value,
	zeroSign = false,
	suffix,
	pill = false,
	className,
}: Props) {
	const gain = value > 0 || (zeroSign && value === 0)
	return (
		<span
			className={cx(
				signTone(value, { zeroSign }),
				pill && pillClass,
				pill &&
					(gain ? gainPillClass : value < 0 ? lossPillClass : evenPillClass),
				className,
			)}
		>
			{formatSigned(value, { zeroSign })}
			{suffix}
		</span>
	)
}
