import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { CardRail } from "#/components/ui/card-rail"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { doubtersVerdict } from "#/lib/fade-copy"
import { CallRow } from "./call-row"
import { GloatStamp } from "./gloat-stamp"

export const DoubtersPanelFragment = graphql(`
	fragment DoubtersPanel_fade on CallFade {
		id
		targetFlippedAt
		winner
		gloat
		call {
			id
			user {
				id
				username
			}
			selections {
				id
				option {
					id
					label
				}
			}
			...CallRow_call
		}
	}
`)

const metaClass = css({
	fontFamily: "mono",
	fontSize: "xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "fg.muted",
	whiteSpace: "nowrap",
})

// Everyone who faded this call, each as their own call. A doubter's call is an
// ordinary call on the other side, so it's shown the way every call on a
// question is, and links to its own page the same way. A rail rather than a
// stack, so a popular call's doubters don't push the rest of the page down.
//
// Nothing renders until someone has faded: an empty list would read as
// "nobody disagrees", which is a claim the page has no way to back.
export function DoubtersPanel({
	fades: fadesProp,
	opUsername,
	formatPick,
}: {
	fades: FragmentType<typeof DoubtersPanelFragment>[]
	opUsername: string
	// Turns an option label into the pick as the page states it ("Under"
	// into "Under 4.5").
	formatPick: (label: string) => string
}) {
	const fades = useFragment(DoubtersPanelFragment, fadesProp)
	if (fades.length === 0) return null

	const cashed = fades.filter((f) => f.winner === "FADER").length
	const wrong = fades.filter((f) => f.winner === "TARGET").length
	const verdict = doubtersVerdict(cashed, wrong)
	const flippedBy = fades
		.filter((f) => f.targetFlippedAt !== null)
		.map((f) => `@${f.call.user.username}`)

	// The side the doubters took. Every fade is on the same two-sided
	// question, so any doubter's pick names it; one whose target flipped
	// onto their side is skipped only because OP now shares it.
	const sideLabel = (fades.find((f) => f.targetFlippedAt === null) ?? fades[0])
		?.call.selections[0]?.option.label

	return (
		<section aria-label="Doubters">
			<CardRail
				items={fades}
				getKey={(fade) => fade.id}
				itemLabel="doubter"
				header={
					<VStack gap="1" alignItems="stretch" flex="1" minWidth="0">
						<HStack justify="space-between" alignItems="baseline" gap="3">
							<h2
								className={css({
									fontSize: "2xl",
									fontWeight: "bold",
									color: "fg.default",
								})}
							>
								Doubters
							</h2>
							<span className={metaClass}>
								{fades.length}
								{sideLabel ? ` on ${formatPick(sideLabel)}` : ""}
							</span>
						</HStack>

						{verdict && (
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									textTransform: "uppercase",
									letterSpacing: "wide",
									color: "fg.default",
								})}
							>
								{verdict}
							</span>
						)}
						{flippedBy.length > 0 && (
							<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
								@{opUsername} flipped after being faded by{" "}
								{flippedBy.join(", ")}
							</span>
						)}
					</VStack>
				}
				renderItem={(fade) => (
					<CallRow
						call={fade.call}
						footer={
							fade.gloat ? (
								<GloatStamp
									username={
										fade.winner === "FADER"
											? fade.call.user.username
											: opUsername
									}
									message={fade.gloat}
								/>
							) : undefined
						}
					/>
				)}
			/>
		</section>
	)
}
