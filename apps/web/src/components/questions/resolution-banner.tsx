import { FaCircleCheck, FaTriangleExclamation } from "react-icons/fa6"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

type Props = {
	// The actual resolved answer (e.g. a winning option's label, or a numeric
	// guess's actual value) - the emphasized part.
	answer: string
	// An admin's free-text caption on how it was resolved - supplementary,
	// not guaranteed to restate the answer itself.
	note?: string | null
	// A dispute can only be filed against an already-resolved question (see
	// resolutionDisputes in db/schema/questions.ts), so `answer` is still the
	// real prior resolution here - just contested, not confirmed. The amber
	// tone and "Disputed —" prefix are what keep this from reading as settled.
	disputed?: boolean
}

export function ResolutionBanner({ answer, note, disputed }: Props) {
	const Icon = disputed ? FaTriangleExclamation : FaCircleCheck
	return (
		<HStack
			gap="2"
			alignItems="flex-start"
			// A dispute is the one state here that needs to interrupt the reader -
			// give it a real amber callout. A plain resolution is just information,
			// so it sits flush on the card instead of getting its own box.
			className={
				disputed
					? css({
							backgroundColor: "warning.subtle",
							borderRadius: "sm",
							padding: "2",
						})
					: undefined
			}
		>
			<Icon
				size={13}
				className={css({
					color: disputed ? "warning.default" : "success.default",
					flexShrink: "0",
					marginTop: "1",
				})}
			/>
			<VStack gap="0.5" alignItems="flex-start">
				<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
					{disputed && (
						<span className={css({ color: "warning.default" })}>
							Disputed —{" "}
						</span>
					)}
					{answer}
				</span>
				{note && (
					<span className={css({ fontSize: "xs", color: "fg.muted" })}>
						{note}
					</span>
				)}
			</VStack>
		</HStack>
	)
}
