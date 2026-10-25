import { PRESSER_REPORT_REASON_LABELS } from "@called-my-shot/schemas"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { ConfirmActionModal } from "#/components/ui/confirm-action-modal"
import {
	AdminDismissPostReportDocument,
	AdminRemovePostDocument,
	AdminRemovePromptDocument,
} from "#/graphql/admin/post-reports/mutations"
import type { AdminPostReportsQuery } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { pluralize } from "#/lib/pluralize"
import { openModal } from "#/stores/modal-store"
import { showToast } from "#/stores/toast-store"

type Report = AdminPostReportsQuery["adminPostReports"][number]

const linkClass = css({
	fontSize: "xs",
	color: "fg.default",
	textDecoration: "underline",
})

const metaClass = css({ fontSize: "xs", color: "fg.muted" })

// One reported post: what was said and picked, who reported it, and the
// three ways to close it out. Removing the prompt takes every answer to it
// down too, so that one asks first.
export function PostReportRow({
	report,
	onDone,
}: {
	report: Report
	onDone: () => Promise<unknown>
}) {
	const dismiss = useGqlMutation(AdminDismissPostReportDocument)
	const removePost = useGqlMutation(AdminRemovePostDocument)
	const removePrompt = useGqlMutation(AdminRemovePromptDocument)
	const post = report.post
	const prompt = post.__typename === "RushmorePost" ? post.prompt : null
	const picks =
		post.__typename === "RushmorePost"
			? [...post.picks].sort((a, b) => a.position - b.position)
			: []

	async function run(
		action: () => Promise<{ __typename: string; message?: string }>,
	): Promise<string | null> {
		const result = await action()
		if (result.__typename !== "PostReportPayload") {
			return result.message ?? "That didn't go through."
		}
		await onDone()
		return null
	}

	async function runInline(
		action: () => Promise<{ __typename: string; message?: string }>,
	) {
		const error = await run(action)
		if (error) showToast({ message: error })
	}

	return (
		<HStack
			justify="space-between"
			gap="4"
			alignItems="flex-start"
			className={css({
				bg: "bg.surface",
				border: "1px solid {colors.border.default}",
				borderRadius: "xl",
				padding: "4",
			})}
		>
			<VStack gap="2" alignItems="flex-start" minWidth="0">
				<span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
					{
						PRESSER_REPORT_REASON_LABELS[
							report.reason.toLowerCase() as keyof typeof PRESSER_REPORT_REASON_LABELS
						]
					}
				</span>
				{prompt && (
					<span className={css({ fontSize: "sm" })}>
						{prompt.title}
						{prompt.isFranchise ? " (franchise prompt)" : ""}
					</span>
				)}
				{picks.length > 0 && (
					<span className={metaClass}>
						{picks
							.map((pick) => `${pick.position}. ${pick.player.name}`)
							.join(" · ")}
					</span>
				)}
				{post.body && (
					<p
						className={css({
							fontSize: "sm",
							whiteSpace: "pre-wrap",
							overflowWrap: "anywhere",
						})}
					>
						{post.body}
					</p>
				)}
				{report.details && <p className={metaClass}>{report.details}</p>}
				<p className={metaClass}>
					by @{post.author.username}
					{post.group ? ` in ${post.group.name}` : ""} · reported by @
					{report.reporter?.username ?? "deleted"}
					{post.removed ? " · already removed" : ""}
				</p>
				<HStack gap="3">
					{!post.removed && (
						<Link
							to="/posts/$postId"
							params={{ postId: post.id }}
							className={linkClass}
						>
							Open the post
						</Link>
					)}
					{prompt && (
						<Link
							to="/rushmore/$code"
							params={{ code: prompt.code }}
							className={linkClass}
						>
							Open the prompt
						</Link>
					)}
				</HStack>
			</VStack>
			<HStack gap="1.5" flexShrink={0} flexWrap="wrap" justify="flex-end">
				<Button
					variant="outline"
					size="sm"
					loading={dismiss.isPending}
					onClick={() =>
						runInline(
							async () =>
								(await dismiss.mutateAsync({ reportId: report.id }))
									.adminDismissPostReport,
						)
					}
				>
					Dismiss
				</Button>
				<Button
					variant="outline"
					size="sm"
					className={css({ color: "danger.default" })}
					loading={removePost.isPending}
					onClick={() =>
						runInline(
							async () =>
								(await removePost.mutateAsync({ reportId: report.id }))
									.adminRemovePost,
						)
					}
				>
					Remove post
				</Button>
				{prompt && (
					<Button
						variant="outline"
						size="sm"
						className={css({ color: "danger.default" })}
						onClick={() =>
							openModal(
								<ConfirmActionModal
									title="Remove this prompt?"
									confirmLabel="Remove prompt"
									danger
									onConfirm={() =>
										run(
											async () =>
												(
													await removePrompt.mutateAsync({
														reportId: report.id,
													})
												).adminRemovePrompt,
										)
									}
								>
									{`"${prompt.title}" comes down with all ${prompt.answerCount} ${pluralize(prompt.answerCount, "answer")} to it.${prompt.isFranchise ? " It's a team's franchise prompt, so that team's page loses its Rushmore card." : ""}`}
								</ConfirmActionModal>,
							)
						}
					>
						Remove prompt
					</Button>
				)}
			</HStack>
		</HStack>
	)
}
