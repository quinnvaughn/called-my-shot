import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button, button } from "#/components/ui/button"
import { Modal } from "#/components/ui/modal"
import { pluralize } from "#/lib/pluralize"
import type { GuestPick } from "#/stores/guest-picks-store"
import { closeModal } from "#/stores/modal-store"

type Props = {
	posted: GuestPick[]
	// Picks the API refused or never received: the game locked before the
	// account existed, or a signing-in user had already called that question.
	notPostedCount: number
}

// Shown on Home right after the picks someone made on the landing page post to
// their new account. Laid out like FirstCallDoneModal, since it's the same
// moment for someone who came in through the landing page instead of a
// question page.
export function GuestPicksPostedModal({ posted, notPostedCount }: Props) {
	const postedCount = posted.length

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<VStack gap="2" alignItems="flex-start">
				<Modal.Title>
					{postedCount === 0
						? "Those picks didn't count"
						: `${postedCount} ${pluralize(postedCount, "call")} in`}
				</Modal.Title>
				<Modal.Description>
					{postedCount === 0
						? "Their games locked before you finished, or you'd already called them. Everything still open is on this page."
						: "They're on your record now and can't be changed. Each one scores when its game goes final."}
				</Modal.Description>
				{postedCount > 0 && notPostedCount > 0 && (
					<p
						className={css({
							fontSize: "xs",
							lineHeight: "relaxed",
							color: "fg.muted",
						})}
					>
						{notPostedCount === 1
							? "1 pick didn't count. Its game locked first, or you'd already called it."
							: `${notPostedCount} picks didn't count. Their games locked first, or you'd already called them.`}
					</p>
				)}
			</VStack>

			{postedCount > 0 && (
				<VStack gap="2" alignItems="stretch">
					{posted.map((pick) => (
						<VStack
							key={pick.questionId}
							gap="0.5"
							alignItems="stretch"
							className={css({
								border: "1px solid {colors.border.default}",
								borderRadius: "md",
								padding: "3",
							})}
						>
							<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
								{pick.title}
							</span>
							<span
								className={css({
									textStyle: "metaLg",
									fontWeight: "bold",
									color: "primary.default",
								})}
							>
								{pick.optionLabel}
							</span>
						</VStack>
					))}
				</VStack>
			)}

			<VStack gap="2" alignItems="stretch">
				<Button variant="solid" size="lg" fullWidth onClick={closeModal}>
					Got it
				</Button>
				{postedCount > 0 && (
					<Link
						to="/my-calls"
						onClick={closeModal}
						className={button({
							variant: "light",
							size: "lg",
							fullWidth: true,
						})}
					>
						See my calls
					</Link>
				)}
			</VStack>
		</Modal>
	)
}
