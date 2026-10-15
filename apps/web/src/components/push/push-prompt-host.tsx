import { useRouterState } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import { useEffect, useRef, useState } from "react"
import { FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { useMe } from "#/hooks/use-me"
import { usePushState } from "#/hooks/use-push-state"
import { type PushPromptReason, track } from "#/lib/analytics"
import {
	isPromptCoolingDown,
	readDismissals,
	recordPromptDismissed,
} from "#/lib/push/cooldown"
import { reasonCopy } from "#/lib/push/prompt-copy"
import { isOfferState, promptStateFor } from "#/lib/push/prompt-state"
import { modalStore } from "#/stores/modal-store"
import {
	pushCardShowingStore,
	pushPromptStore,
	takePendingPushPrompt,
} from "#/stores/push-prompt-store"
import { PushOffer } from "./push-offer"

// How long a page has to sit still before the card appears, so it lands on
// the page a call or challenge leads to rather than flashing on the one it
// left.
const SETTLE_MS = 600

// Shows the push card once something that earned it has happened
// (requestPushPrompt) and the page has settled with no modal up. A fixed card
// rather than a modal: closeAllModals runs on every page change, and this has
// to survive the navigation that usually follows the moment that asked for it.
export function PushPromptHost() {
	const me = useMe()
	const pending = useStore(pushPromptStore, (s) => s)
	const modalOpen = useStore(modalStore, (stack) => stack.length > 0)
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const push = usePushState()
	const state = promptStateFor(push)
	const [reason, setReason] = useState<PushPromptReason | null>(null)
	const shownOn = useRef<string | null>(null)

	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname restarts the wait on each page change
	useEffect(() => {
		if (!me || reason || modalOpen || state === "loading") return
		const timer = setTimeout(() => {
			const next = takePendingPushPrompt()
			if (
				!next ||
				!isOfferState(state) ||
				isPromptCoolingDown(readDismissals(), Date.now())
			) {
				return
			}
			shownOn.current = pathname
			setReason(next)
			track("push_prompt_shown", { reason: next, state })
		}, SETTLE_MS)
		return () => clearTimeout(timer)
	}, [me, pending, reason, modalOpen, state, pathname])

	const visible = reason !== null && isOfferState(state)

	// Leaving the page without answering counts as a no.
	useEffect(() => {
		if (reason && shownOn.current !== pathname) {
			recordPromptDismissed()
			track("push_prompt_dismissed", { reason })
			setReason(null)
		}
	}, [pathname, reason])

	useEffect(() => {
		pushCardShowingStore.setState(() => visible)
	}, [visible])

	if (!visible || !reason || !isOfferState(state)) return null

	function handleDismiss() {
		if (!reason) return
		recordPromptDismissed()
		track("push_prompt_dismissed", { reason })
		setReason(null)
	}

	return (
		<div
			className={css({
				position: "fixed",
				zIndex: "launcher",
				bottom: "calc({spacing.5} + env(safe-area-inset-bottom))",
				right: { base: "4", md: "6" },
				left: { base: "4", md: "auto" },
				width: { base: "auto", md: "sm" },
				backgroundColor: "bg.surface",
				border: "1px solid {colors.border.emphasized}",
				borderRadius: "xl",
				padding: "4",
				boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
			})}
		>
			<HStack gap="3" alignItems="flex-start" justify="space-between">
				<VStack gap="2.5" alignItems="flex-start" minWidth="0">
					<span
						className={css({
							fontFamily: "heading",
							fontSize: "sm",
							color: "fg.default",
						})}
					>
						{reasonCopy(reason)}
					</span>
					<PushOffer state={state} push={push} surface="card" />
				</VStack>
				<button
					type="button"
					aria-label="Dismiss"
					onClick={handleDismiss}
					className={css({
						display: "flex",
						flexShrink: 0,
						color: "fg.subtle",
						cursor: "pointer",
						_hover: { color: "fg.default" },
					})}
				>
					<FiX size={16} />
				</button>
			</HStack>
		</div>
	)
}
