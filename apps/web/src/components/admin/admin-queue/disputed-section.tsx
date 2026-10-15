import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { formatTimeAgo } from "#/lib/format-date"
import type { AdminQueueSummary } from "./types"

export function DisputedSection({
	disputes,
}: {
	disputes: AdminQueueSummary["disputed"]
}) {
	return (
		<VStack gap="3" alignItems="stretch">
			<span
				className={css({
					textStyle: "label",
					color: "fg.subtle",
				})}
			>
				Disputed
			</span>
			{disputes.map((dispute) => (
				<HStack
					key={dispute.id}
					justify="space-between"
					gap="4"
					className={css({
						bg: "bg.surface",
						border: "1px solid {colors.border.default}",
						borderRadius: "xl",
						padding: "3.5",
					})}
				>
					<VStack
						gap="1"
						alignItems="flex-start"
						className={css({ minWidth: 0 })}
					>
						<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
							{dispute.question.title}
						</span>
						<span
							className={css({
								textStyle: "meta",
								color: "fg.subtle",
							})}
						>
							@{dispute.user.username} · {formatTimeAgo(dispute.createdAt)}
						</span>
					</VStack>
					<Link
						to="/admin/disputes"
						className={button({ variant: "outline", size: "sm" })}
					>
						Review
					</Link>
				</HStack>
			))}
		</VStack>
	)
}
