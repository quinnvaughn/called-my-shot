import { useNavigate } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { match, P } from "ts-pattern"
import type { CastCallFormState } from "#/components/questions/cast-call-form"
import { shownPickerOptions } from "#/components/questions/cast-call-form/option-picker-list"
import { useRequireAuth } from "#/hooks/use-require-auth"
import { buildQuestionSlug } from "#/lib/slug"
import { modalStore } from "#/stores/modal-store"
import { tourStepStore } from "#/stores/tour-store"
import type { QuestionSetStop } from "./question-set-position"

type Options = {
	callForm: CastCallFormState
	// The pick form is on screen: a first call, or a redo being picked.
	canPick: boolean
	prev: QuestionSetStop | null
	next: QuestionSetStop | null
}

// Typing goes to the field, never to a shortcut.
const TEXT_ENTRY =
	"input, textarea, select, [contenteditable]:not([contenteditable='false'])"

// Controls that move with the arrow keys themselves (the conviction slider,
// a tab bar).
const ARROW_WIDGET =
	'[role="slider"], [role="tab"], [role="radio"], [role="listbox"], [role="option"], [role="menu"], [role="menuitem"], [role="combobox"]'

// Controls Enter already activates. An option row is the exception: Enter on
// it would only pick the row again, so it locks in what's picked instead.
const ACTIVATES_ON_ENTER = 'a[href], button, [role="button"], summary'

// Desktop keys on a question's page. While a single pick is being made, 1-9
// pick the row that's that far down the list and Enter locks it in, behind
// the same sign-in step as Lock It In. Left and right step through the
// question's set, the same stops as its Prev and Next links. Nothing fires
// while a modal or the first-call walkthrough is up, while typing, or with a
// modifier held, which belongs to the browser.
export function useQuestionPageShortcuts(options: Options) {
	const navigate = useNavigate()
	const requireAuth = useRequireAuth()
	// Read inside the listener rather than re-binding it every render.
	const latest = useRef({ ...options, navigate, requireAuth })
	useEffect(() => {
		latest.current = { ...options, navigate, requireAuth }
	})

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.defaultPrevented || event.repeat) return
			if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
				return
			}
			if (modalStore.state.length > 0 || tourStepStore.state !== null) return
			const target = event.target instanceof Element ? event.target : null
			if (target?.closest(TEXT_ENTRY)) return

			const { callForm, canPick, prev, next, navigate, requireAuth } =
				latest.current
			const isPicking =
				canPick && callForm.bucket === "single" && callForm.question != null

			match(event.key)
				.with("ArrowLeft", "ArrowRight", (key) => {
					if (target?.closest(ARROW_WIDGET)) return
					const stop = key === "ArrowLeft" ? prev : next
					if (!stop) return
					event.preventDefault()
					void navigate({
						to: "/questions/$questionId/{-$slug}",
						params: {
							questionId: stop.questionId,
							slug: buildQuestionSlug(stop.questionTitle),
						},
					})
				})
				.with("Enter", () => {
					if (!isPicking) return
					if (
						target?.closest(ACTIVATES_ON_ENTER) &&
						!target.closest(`#${callForm.formId} button[aria-pressed]`)
					) {
						return
					}
					const meta = callForm.form.meta()
					if (meta.isSubmitting || !meta.canSubmit) return
					event.preventDefault()
					requireAuth(() => {
						document
							.querySelector<HTMLFormElement>(`#${callForm.formId}`)
							?.requestSubmit()
					})
				})
				.with(P.string.regex(/^[1-9]$/), (digit) => {
					if (!isPicking || !callForm.question) return
					const pickedIds = callForm.selections.map((s) => s.optionId)
					const { visible } = shownPickerOptions(
						callForm.question.options,
						callForm.shape,
						callForm.optionPages,
						(optionId) => pickedIds.includes(optionId),
					)
					const option = visible[Number(digit) - 1]
					if (!option) return
					event.preventDefault()
					callForm.selectSingle(option.id)
				})
				.otherwise(() => {})
		}

		document.addEventListener("keydown", onKeyDown)
		return () => document.removeEventListener("keydown", onKeyDown)
	}, [])
}
