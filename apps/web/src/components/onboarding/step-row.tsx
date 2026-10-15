import { FiCheck } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import type { OnboardingStep } from "./onboarding-steps"

export function StepRow({
	step,
	action,
}: {
	step: OnboardingStep
	action: React.ReactNode
}) {
	return (
		<HStack gap="3" alignItems="flex-start">
			<span
				aria-hidden
				className={css({
					display: "flex",
					flexShrink: 0,
					alignItems: "center",
					justifyContent: "center",
					width: "5",
					height: "5",
					marginTop: "0.5",
					borderRadius: "full",
					border: "1px solid {colors.border.emphasized}",
					bg: step.done ? "primary.default" : "transparent",
					color: "primary.contrast",
				})}
			>
				{step.done && <FiCheck size={12} />}
			</span>
			<VStack gap="1.5" alignItems="flex-start" minWidth="0">
				<span
					className={css({
						fontSize: "sm",
						fontWeight: "semibold",
						color: step.done ? "fg.muted" : "fg.default",
						textDecoration: step.done ? "line-through" : "none",
					})}
				>
					{step.title}
				</span>
				<p
					className={css({
						fontSize: "xs",
						lineHeight: "relaxed",
						color: "fg.muted",
					})}
				>
					{step.body}
				</p>
				{step.blockedBy && (
					<span
						className={css({
							textStyle: "meta",
							color: "fg.subtle",
						})}
					>
						Verify your email first
					</span>
				)}
				{action}
			</VStack>
		</HStack>
	)
}
