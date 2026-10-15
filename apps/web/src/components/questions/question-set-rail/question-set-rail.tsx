import { Link } from "@tanstack/react-router"
import { type ReactNode, useState } from "react"
import { HStack, VStack } from "styled-system/jsx"
import { arrowLink } from "#/components/ui/arrow-link"
import { Tabs } from "#/components/ui/tabs"
import { questionSetNavigation } from "#/lib/question-set-navigation"
import {
	type QuestionSetRailRow,
	questionSetRailSummary,
} from "#/lib/question-set-rail"
import { buildQuestionSlug } from "#/lib/slug"
import { LiveTag } from "./live-tag"
import { RailList } from "./rail-list"
import { RailStatusLine } from "./rail-status-line"
import { SignedOut } from "./signed-out"
import { Summary } from "./summary"

// A second list behind tabs beside the set's own: calls made on top of the
// set, like a game's community questions. The tab bar only shows once it has
// rows.
export type QuestionSetRailExtraTab = {
	setLabel: string
	extraLabel: string
	rows: QuestionSetRailRow[]
}

type Props = {
	// The left of the header line: what the set is, linked to its own page
	// when the rail sits beside one of its questions.
	heading: ReactNode
	isLive?: boolean
	rows: QuestionSetRailRow[]
	// Null when signed out.
	username: string | null
	// Shown in place of the summary when signed out.
	signedOutText: string
	// The question on screen, when the rail sits beside one: it's marked, and
	// the jump to the next uncalled question counts on from it.
	currentQuestionId?: string
	// Beside the summary once anything is called.
	share: ReactNode
	// A full-width action under the summary, for the signed-in viewer.
	action?: ReactNode
	// The viewer's picks on this set as a page of their own.
	picksPath: string | null
	// When the live numbers were last read, while there are any.
	statsAsOf?: string | null
	extraTab?: QuestionSetRailExtraTab | null
}

// A set of questions (a game's official ones, a ballot's members) as one list
// beside the page, with the viewer's call on each. What's left to do sits on
// top, since the list can run past the bottom of the screen: the open count
// and the next uncalled question. QuestionSetStrip's job from xl up, with the
// room to say what each pick is.
export function QuestionSetRail({
	heading,
	isLive = false,
	rows,
	username,
	signedOutText,
	currentQuestionId,
	share,
	action,
	picksPath,
	statsAsOf = null,
	extraTab = null,
}: Props) {
	const extraRows = extraTab?.rows ?? []
	const currentIsExtra = extraRows.some(
		(r) => r.questionId === currentQuestionId,
	)
	// Opens on whichever list holds the question on screen. A tab picked by
	// hand holds only while that question is, so moving to another question
	// follows it to its list again.
	const [picked, setPicked] = useState<{
		tab: "set" | "extra"
		on: string | undefined
	} | null>(null)
	const activeTab =
		picked && picked.on === currentQuestionId
			? picked.tab
			: currentIsExtra
				? "extra"
				: "set"

	if (rows.length === 0 && extraRows.length === 0) return null

	const summary = questionSetRailSummary(rows, extraRows)
	const currentIndex = rows.findIndex((r) => r.questionId === currentQuestionId)
	const { nextUncalledIndex } = questionSetNavigation(
		rows.map((r) => r.state),
		currentIndex,
	)
	const nextUncalled =
		nextUncalledIndex !== null ? rows[nextUncalledIndex] : undefined
	const openUncalled = rows.filter((r) => r.state === "uncalled")
	const hasCalls = summary.calledCount > 0 || extraRows.length > 0

	return (
		<VStack gap="3" alignItems="stretch">
			<HStack justify="space-between" alignItems="baseline" gap="3">
				{heading}
				{isLive && <LiveTag />}
			</HStack>

			{username ? (
				<>
					<HStack justify="space-between" alignItems="center" gap="3">
						<Summary summary={summary} />
						{hasCalls && share}
					</HStack>
					{action}
				</>
			) : (
				<SignedOut text={signedOutText} />
			)}

			<RailStatusLine openUncalled={openUncalled} statsAsOf={statsAsOf} />

			{nextUncalled && (
				<Link
					to="/questions/$questionId/{-$slug}"
					params={{
						questionId: nextUncalled.questionId,
						slug: buildQuestionSlug(nextUncalled.questionTitle),
					}}
					className={arrowLink({ tone: "primary" })}
				>
					Next uncalled: {nextUncalled.label} →
				</Link>
			)}

			{extraTab && extraRows.length > 0 && (
				<Tabs
					value={activeTab}
					onValueChange={(tab) => setPicked({ tab, on: currentQuestionId })}
				>
					<Tabs.List stretch>
						<Tabs.Trigger value="set">
							{extraTab.setLabel} {summary.calledCount}/{summary.questionCount}
						</Tabs.Trigger>
						<Tabs.Trigger value="extra">
							{extraTab.extraLabel} {extraRows.length}
						</Tabs.Trigger>
					</Tabs.List>
				</Tabs>
			)}

			<RailList
				rows={activeTab === "extra" && extraRows.length > 0 ? extraRows : rows}
				currentQuestionId={currentQuestionId}
			/>

			{/* After the list rather than above it: it's the same picks as a
			    page of their own, which is where you'd go having read them. */}
			{username && picksPath && hasCalls && (
				<Link to={picksPath} className={arrowLink({ tone: "primary" })}>
					Your picks page →
				</Link>
			)}
		</VStack>
	)
}
