import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { CallPresserExcerpt } from "#/components/pressers/call-presser-excerpt"
import { CallPageHeader } from "#/components/questions/call-page/call-page-header"
import { CallPageLinks } from "#/components/questions/call-page/call-page-links"
import { CallPageRecord } from "#/components/questions/call-page/call-page-record"
import { CallPageViewerActions } from "#/components/questions/call-page/call-page-viewer-actions"
import { DoubtersPanel } from "#/components/questions/doubters-panel"
import { RedoPanel } from "#/components/questions/redo-panel"
import { NotFound } from "#/components/ui/not-found"
import { callRecordQuery } from "#/graphql/calls/queries"
import { useMe } from "#/hooks/use-me"
import { callCardVersion, callPageMeta } from "#/lib/call-meta"
import { marginLabel } from "#/lib/call-summary"
import { describeCall } from "#/lib/call-view"
import { isRateStat } from "#/lib/field-signal"
import { formatCallDate, formatCallLead } from "#/lib/format-date"
import { pageMeta } from "#/lib/meta"
import {
	isOverUnderQuestionShape,
	optionDisplayLabel,
	shareCardShapeLabel,
} from "#/lib/question-labels"

// No slug segment, unlike /questions/:id/:slug and /games/:id/:slug. A slug
// there earns its keep with crawlers; nothing about a single person's call
// wants indexing, and calls are deliberately left out of the sitemap for the
// same reason. This url exists to be pasted, so its title and og:image each
// state the whole call on their own (see lib/call-meta.ts).
export const Route = createFileRoute("/_app/calls/$callId")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(callRecordQuery(params.callId))
		return { call: data.call ?? null }
	},
	head: ({ loaderData }) => {
		const call = loaderData?.call
		if (!call) return {}

		const view = describeCall(call)
		const { title, description } = callPageMeta({
			username: view.username,
			pickLabel: view.pickLabel,
			questionTitle: call.question.title,
			game: call.question.game,
			leagueAbbr: view.leagueAbbr,
			shapeLabel: shareCardShapeLabel[call.question.shape],
			conviction: view.conviction,
			points: view.points,
			isWin: view.isWin,
			exact: view.closeness?.kind === "exact",
			marginLabel: view.margin?.verdict
				? marginLabel(view.margin.verdict, view.isWin === true)
				: null,
			questionStatus: view.questionStatus,
			calledAt: view.calledAt,
			locksAt: formatCallDate(view.locksAt),
			resolvedAt: view.resolvedAt ? formatCallDate(view.resolvedAt) : null,
			caseText: call.caseText,
		})

		return pageMeta({
			title,
			description,
			path: `/calls/${call.id}`,
			image: {
				// Third-party unfurl caches hold a scraped card for days, so a
				// link shared while the call was pending would keep previewing
				// "awaiting result" long after it settled. Resolution changes this
				// url, which is a url they have never scraped. It can't fix links
				// already posted; it does fix every share after. The proxy route
				// ignores the param.
				path: `/share/calls/${call.id}/card.png?v=${callCardVersion(
					view.resolvedAt,
					call.streak?.length ?? null,
					call.redo?.redoneAt ?? null,
				)}`,
				alt: title,
			},
		})
	},
})

function RouteComponent() {
	const { callId } = Route.useParams()
	const { data } = useSuspenseQuery(callRecordQuery(callId))
	const call = data.call
	const me = useMe()

	if (!call) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Call"
				heading="This call doesn't exist"
				subtitle="It may have been removed, or the link's just wrong. Double check the URL."
				link={{ text: "View the leaderboard", url: "/leaderboard" }}
			/>
		)
	}

	const view = describeCall(call)

	const lead = view.resolvedAt
		? formatCallLead(call.createdAt, view.resolvedAt)
		: null

	return (
		<VStack gap="6" alignItems="stretch">
			<CallPageHeader call={call} />

			<CallPageRecord call={call} view={view} me={me} />

			{call.presser && (
				<CallPresserExcerpt
					callId={call.id}
					presser={call.presser}
					questions={call.presserQuestions}
				/>
			)}

			<CallPageViewerActions call={call} view={view} signedIn={Boolean(me)} />

			{/* Directly under the record, because it is about the record: this
			call's time is the redo's time, and without this the page would
			quietly show the later one as if it were the only one. */}
			{view.redo && <RedoPanel data={view.redo} />}

			<CallPageLinks call={call} view={view} />

			{/* The gap between calling something and being right about it is the
			claim this page exists to make, so it's stated in words rather than
			left for the reader to subtract two dates. */}
			{lead && (
				<span
					className={css({
						textStyle: "label",
						color: "fg.subtle",
					})}
				>
					{lead}
				</span>
			)}

			<DoubtersPanel
				fades={call.doubters}
				opUsername={view.username}
				formatPick={(label) =>
					optionDisplayLabel(
						label,
						isOverUnderQuestionShape(call.question.shape),
						call.question.ouLine,
						isRateStat(call.question),
					)
				}
			/>
		</VStack>
	)
}
