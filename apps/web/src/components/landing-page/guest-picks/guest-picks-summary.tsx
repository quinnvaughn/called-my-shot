import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AuthModal, type AuthModalView } from "#/components/auth/auth-modal"
import { LockLine } from "#/components/questions/lock-line"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { track } from "#/lib/analytics"
import { pluralize } from "#/lib/pluralize"
import type { GuestPick } from "#/stores/guest-picks-store"
import { openModal } from "#/stores/modal-store"

type Props = {
	picks: GuestPick[]
	onChangePicks: () => void
}

// The end of the try-it stack. Signing up (or in) from here needs no onSuccess
// of its own: AuthModal lands everyone on Home, which posts whatever is waiting
// in guest-picks-store.
export function GuestPicksSummary({ picks, onChangePicks }: Props) {
	const count = picks.length
	const calls = pluralize(count, "call")

	function openAuth(view: AuthModalView) {
		track("guest_picks_signup_opened", { pickCount: count })
		openModal(
			<AuthModal
				defaultView={view}
				surface="guest_picks"
				copy={{
					signup: {
						title: `Lock in your ${count} ${calls}`,
						description:
							"They count as soon as your account exists. Free, about 30 seconds.",
					},
					signin: {
						title: "Sign in to lock these in",
						description: `Your ${count} ${calls} post the moment you're in.`,
					},
				}}
			/>,
		)
	}

	return (
		<Card variant="surface" size="lg">
			<Card.Body>
				<VStack
					gap="5"
					alignItems="stretch"
					className={css({ minHeight: "22rem" })}
				>
					<VStack gap="2" alignItems="flex-start">
						<Eyebrow>Your calls</Eyebrow>
						<h2
							className={css({
								fontFamily: "heading",
								fontSize: "xl",
								lineHeight: "snug",
							})}
						>
							Lock in your {count} {calls}
						</h2>
						<p
							className={css({
								fontSize: "sm",
								lineHeight: "relaxed",
								color: "fg.muted",
							})}
						>
							They only count once you have an account. Sign up and they post
							automatically.
						</p>
					</VStack>
					<VStack gap="2" alignItems="stretch">
						{picks.map((pick) => (
							<VStack
								key={pick.questionId}
								gap="1"
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
								<HStack justify="space-between" alignItems="center" gap="3">
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "xs",
											fontWeight: "bold",
											color: "primary.default",
										})}
									>
										{pick.optionLabel}
									</span>
									<span
										className={css({
											fontFamily: "mono",
											fontSize: "3xs",
											color: "fg.subtle",
											whiteSpace: "nowrap",
										})}
									>
										<LockLine status="OPEN" locksAt={pick.locksAt} />
									</span>
								</HStack>
							</VStack>
						))}
					</VStack>
					<VStack gap="2" alignItems="stretch" marginTop="auto">
						<Button
							variant="solid"
							size="lg"
							fullWidth
							onClick={() => openAuth("signup")}
						>
							Sign up to lock these in
						</Button>
						<HStack justify="space-between" alignItems="center" gap="3">
							<Button variant="ghost" size="sm" onClick={onChangePicks}>
								Change picks
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => openAuth("signin")}
							>
								I have an account
							</Button>
						</HStack>
					</VStack>
				</VStack>
			</Card.Body>
		</Card>
	)
}
