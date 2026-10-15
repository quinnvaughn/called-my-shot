import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { PlayerOrTeamImage } from "#/components/ui/player-or-team-image"
import type { Breakdown, PickSubject } from "./types"
import { WhyThesePoints } from "./why-these-points"

// Collapsed by default so the card stays a name and a number at a glance -
// the reasoning is one click away, not something everyone has to read past
// every time.
// name is nullable on purpose - when the pick's own name is already showing
// elsewhere on the card (the resolved title, for a single pick), repeating
// it as this row's header too is pure duplication. Only multi-pick cases
// (multi_select, or the pending preview where nothing else names the pick
// yet) pass a real name.
export function PickRowShell({
	name,
	subject = null,
	note,
	playNote = null,
	breakdown,
	payout,
	hero = false,
}: {
	name: string | null
	subject?: PickSubject | null
	note: string | null
	// See seasonPlayLine.
	playNote?: string | null
	breakdown: Breakdown | null
	payout: ReactNode
	hero?: boolean
}) {
	if (hero) {
		return (
			<VStack gap="3" alignItems="stretch">
				{name !== null && (
					<HStack gap="3" alignItems="center" minWidth="0">
						{subject && (
							<PlayerOrTeamImage
								player={subject.player}
								team={subject.team}
								size="lg"
							/>
						)}
						<span
							className={css({
								fontFamily: "heading",
								fontSize: { base: "2xl", sm: "3xl" },
								lineHeight: "1.15",
								color: "fg.default",
							})}
						>
							{name}
						</span>
					</HStack>
				)}
				{note && (
					<span
						className={css({
							textStyle: "metaLg",
							color: "fg.muted",
						})}
					>
						{note}
					</span>
				)}
				{payout}
				{playNote && (
					<span
						className={css({
							textStyle: "metaLg",
							color: "fg.muted",
						})}
					>
						{playNote}
					</span>
				)}
				{breakdown && <WhyThesePoints breakdown={breakdown} />}
			</VStack>
		)
	}

	return (
		<VStack
			gap="1.5"
			alignItems="stretch"
			className={css({
				backgroundColor: "bg.canvas",
				borderRadius: "md",
				paddingBlock: "2.5",
				paddingInline: "3.5",
			})}
		>
			{name !== null && (
				<HStack justify="space-between" gap="3">
					<HStack gap="2" alignItems="center" minWidth="0">
						{subject && (
							<PlayerOrTeamImage player={subject.player} team={subject.team} />
						)}
						<span
							className={css({
								fontSize: "sm",
								fontWeight: "bold",
								color: "fg.default",
								truncate: true,
							})}
						>
							{name}
						</span>
					</HStack>
					<span
						className={css({
							flexShrink: "0",
							textStyle: "metaLg",
							whiteSpace: "nowrap",
						})}
					>
						{payout}
					</span>
				</HStack>
			)}
			{[note, playNote].map(
				(line) =>
					line && (
						<span
							key={line}
							className={css({
								textStyle: "metaLg",
								color: "fg.muted",
							})}
						>
							{line}
						</span>
					),
			)}
			{breakdown && <WhyThesePoints breakdown={breakdown} />}
		</VStack>
	)
}
