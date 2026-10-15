import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { formatTimeAgo } from "#/lib/format-date"
import type { AdminQueueSummary } from "./types"

export function ProbablyStillLiveSection({
	questions,
}: {
	questions: AdminQueueSummary["probablyStillLive"]
}) {
	return (
		<VStack gap="3" alignItems="stretch">
			<span
				className={css({
					textStyle: "label",
					color: "fg.subtle",
				})}
			>
				Locked recently: probably still live (estimate)
			</span>
			{questions.map((question) => (
				<HStack
					key={question.id}
					justify="space-between"
					gap="4"
					className={css({
						bg: "bg.surface",
						border: "1px solid {colors.border.default}",
						borderRadius: "xl",
						padding: "3.5",
					})}
				>
					<VStack gap="1" alignItems="flex-start">
						<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
							{question.title}
						</span>
						<span
							className={css({
								textStyle: "meta",
								color: "fg.subtle",
							})}
						>
							locked {formatTimeAgo(question.locksAt)} · {question.callCount}{" "}
							callers
						</span>
					</VStack>
				</HStack>
			))}
		</VStack>
	)
}
