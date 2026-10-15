import { Link } from "@tanstack/react-router"
import { type ReactNode, useState } from "react"
import type { IconType } from "react-icons"
import { FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Card } from "#/components/ui/card"
import { SignedPoints } from "#/components/ui/signed-points"
import { useMediaQuery } from "#/hooks/use-media-query"
import { questionSetNavigation } from "#/lib/question-set-navigation"
import { buildQuestionSlug } from "#/lib/slug"
import { StripChipGrid } from "./strip-chip-grid"
import { StripHeader } from "./strip-header"
import { StripMemberList } from "./strip-member-list"
import { StripNav } from "./strip-nav"
import type { QuestionSetMember } from "./types"

type Props = {
	name: string
	icon: IconType
	// Names the set in the header control's aria label: "Show {this} navigation".
	navigationLabel: string
	// Says what the chips are ("8 official"), in place of the position count,
	// when the question on screen isn't one of them. Without it the grid has no
	// stated relationship to the page it's on.
	setSummary?: string
	// What the empty prev/next box says at either end.
	startLabel: string
	endLabel: string
	// In order.
	members: QuestionSetMember[]
	currentQuestionId: string
	// Sits at the end of the scorecard toggle's row, inside the collapsible
	// body: something to do with the set as a whole (sharing your picks on
	// it), not with the question on screen.
	action?: ReactNode
	// On the root card, for a page that shows the strip only at some widths.
	className?: string
}

// Pure navigation/discovery over a set of independently-resolving questions
// (a ballot, a game's official questions). Each member's state is derived
// from the exact same fields the rest of the app already uses for won/lost
// (see ballot-member-state.ts), not a parallel state machine.
//
// The question on screen may not be a member (a community question on a
// game): the chips, scorecard and next-unanswered jump still show, but there
// is no position to count from, so no "N of M", no highlighted chip and no
// prev/next.
export function QuestionSetStrip({
	name,
	icon,
	navigationLabel,
	setSummary,
	startLabel,
	endLabel,
	members,
	currentQuestionId,
	action,
	className,
}: Props) {
	// null means "whatever this viewport defaults to" - closed on a phone,
	// where the strip is most of the screen, open on anything wider. That
	// default is expressed as CSS rather than as state so it survives server
	// rendering; a reader who touches the control replaces it with an explicit
	// true/false for the rest of the page's life.
	const [collapsedOverride, setCollapsed] = useState<boolean | null>(null)
	// Drives only the label and aria state of the header control, never the
	// collapse itself, which is plain CSS below - so a phone never renders the
	// open strip and then jumps to closed once React takes over.
	const isCompactViewport = useMediaQuery("(max-width: 639px)")
	const currentIndex = members.findIndex(
		(m) => m.questionId === currentQuestionId,
	)
	const isMember = currentIndex >= 0
	// A set the question on screen isn't part of starts closed at every width:
	// none of it is about what you're reading, so it stays a one-line header
	// naming the set until someone asks for the rest.
	const isCollapsed = collapsedOverride ?? (isMember ? isCompactViewport : true)
	const {
		prevIndex,
		nextIndex,
		nextUncalledIndex,
		resolvedCount,
		pendingCount,
		calledCount,
		wonCount,
	} = questionSetNavigation(
		members.map((m) => m.state),
		currentIndex,
	)
	const prev = prevIndex !== null ? members[prevIndex] : null
	const next = nextIndex !== null ? members[nextIndex] : null
	const nextUnanswered =
		nextUncalledIndex !== null ? members[nextUncalledIndex] : null
	// Only resolved calls ever carry non-null points (see CallRef.totalPoints
	// in the API - null while any pick is still pending), so this is a plain sum
	// with no extra filtering needed.
	const totalPoints = members.reduce((sum, m) => sum + (m.points ?? 0), 0)

	// Written out per case rather than composed, so every rule Panda has to
	// extract is a literal it can see at build time.
	const bodyClass = match({ collapsedOverride, isMember })
		.with({ collapsedOverride: null, isMember: true }, () =>
			css({
				display: { base: "none", sm: "flex" },
				flexDirection: "column",
				gap: "3",
				alignItems: "stretch",
			}),
		)
		.with({ collapsedOverride: null, isMember: false }, () =>
			css({ display: "none" }),
		)
		.with({ collapsedOverride: true }, () => css({ display: "none" }))
		.with({ collapsedOverride: false }, () =>
			css({
				display: "flex",
				flexDirection: "column",
				gap: "3",
				alignItems: "stretch",
			}),
		)
		.exhaustive()

	return (
		<Card className={className}>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					<StripHeader
						name={name}
						icon={icon}
						navigationLabel={navigationLabel}
						setSummary={setSummary}
						isCollapsed={isCollapsed}
						collapsedOverride={collapsedOverride}
						isMember={isMember}
						currentIndex={currentIndex}
						memberCount={members.length}
						onToggle={() => setCollapsed(!isCollapsed)}
					/>

					<div className={bodyClass}>
						<StripChipGrid members={members} currentIndex={currentIndex} />

						<StripMemberList
							members={members}
							currentIndex={currentIndex}
							action={action}
						/>

						{isMember && (
							<StripNav
								prev={prev}
								next={next}
								startLabel={startLabel}
								endLabel={endLabel}
							/>
						)}

						<HStack justify="space-between" alignItems="baseline" gap="2">
							<span
								className={css({
									textStyle: "meta",
									color: "fg.subtle",
								})}
							>
								{resolvedCount > 0
									? `${wonCount} of ${resolvedCount} right${
											pendingCount > 0 ? ` · ${pendingCount} pending` : ""
										}`
									: `${calledCount} of ${members.length} called`}
							</span>
							{resolvedCount > 0 && (
								<SignedPoints
									value={totalPoints}
									zeroSign
									className={css({
										textStyle: "metaLg",
										fontWeight: "bold",
									})}
								/>
							)}
						</HStack>

						{nextUnanswered && (
							<Link
								to="/questions/$questionId/{-$slug}"
								params={{
									questionId: nextUnanswered.questionId,
									slug: buildQuestionSlug(nextUnanswered.questionTitle),
								}}
								className={css({
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									gap: "1.5",
									width: "full",
									backgroundColor: "bg.subtle",
									border: "1px solid {colors.border.default}",
									borderRadius: "lg",
									paddingBlock: "2.5",
									fontFamily: "mono",
									fontSize: "2xs",
									letterSpacing: "wide",
									color: "primary.default",
									_hover: { border: "1px solid {colors.primary.default}" },
								})}
							>
								<span className={css({ textTransform: "uppercase" })}>
									next unanswered: {nextUnanswered.jumpLabel}
								</span>
								<FiChevronRight />
							</Link>
						)}
					</div>
				</VStack>
			</Card.Body>
		</Card>
	)
}
