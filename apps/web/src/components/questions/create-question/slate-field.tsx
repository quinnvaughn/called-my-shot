import { useQuery } from "@apollo/client/react"
import { Link } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Combobox } from "#/components/ui/combobox"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import { TextInput } from "#/components/ui/text-input"
import {
	AdminSlateDocument,
	AdminSlateSearchDocument,
} from "#/graphql/queries/slates"
import type { CreateQuestionFormApi } from "./form-types"

type Props = {
	form: CreateQuestionFormApi
	leagueId: string
	// Set when arriving from the admin Slates builder's "+ New Question"
	// button (?slateId=... on /new-question) - the slate is fixed context
	// here, not something re-searched. See new-question.tsx's validateSearch.
	lockedSlateId?: string
}

const DEBOUNCE_MS = 250

type SelectedSlate = { id: string; name: string; memberCount: number }

// Admin-only placement into a Slate - a search/autocomplete over existing
// slates scoped to the question's own league, deliberately NOT a <select>
// (a slate list is unbounded and a dropdown doesn't scale or explain itself
// the way a search result row can). Once a slate is picked, reveals exactly
// two more fields (label required, slot optional) - no reorder/position
// preview here, new questions just append to the end of the slate.
//
// Reads/writes the whole `slate` value as one object (never a dotted
// "slate.label" path) - the form hook's Path/PathValue generics can't
// correctly type a nested field under an optional object (keyof on a
// `T | undefined` union collapses to never), so every update here goes
// through the one top-level path that works.
export function SlateField({ form, leagueId, lockedSlateId }: Props) {
	const slateValue = form.useWatch("slate")
	const slateId = slateValue?.slateId
	const [inputText, setInputText] = useState("")
	const [open, setOpen] = useState(false)
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
	const [debouncedQuery, setDebouncedQuery] = useState("")
	const [selectedSlate, setSelectedSlate] = useState<SelectedSlate | null>(null)

	useEffect(() => {
		const id = setTimeout(
			() => setDebouncedQuery(inputText.trim()),
			DEBOUNCE_MS,
		)
		return () => clearTimeout(id)
	}, [inputText])

	// A league change invalidates whatever slate was picked under the old one
	// (the server rejects a cross-league slate at submit time anyway) - same
	// pattern as GameField clearing gameId on a league change. Locked slates
	// (arrived via ?slateId=) skip this - that context is fixed regardless of
	// what the league field happens to show.
	const prevLeagueId = useRef(leagueId)
	useEffect(() => {
		if (prevLeagueId.current !== leagueId) {
			prevLeagueId.current = leagueId
			if (!lockedSlateId && slateId) {
				form.setValue("slate", undefined)
				setSelectedSlate(null)
			}
		}
	}, [leagueId, lockedSlateId, slateId, form])

	const { data: searchData } = useQuery(AdminSlateSearchDocument, {
		variables: { leagueId, query: debouncedQuery || undefined },
		skip: !leagueId || !!lockedSlateId || !!slateId,
	})
	const results =
		searchData?.adminSlateSearch.__typename === "QueryAdminSlateSearchSuccess"
			? searchData.adminSlateSearch.data
			: []

	// Resolves the locked slate's own display name/count - the create form
	// never fetched it otherwise, since arriving here skips the search step.
	const { data: lockedData } = useQuery(AdminSlateDocument, {
		variables: { id: lockedSlateId ?? "" },
		skip: !lockedSlateId,
	})
	const lockedSlate =
		lockedData?.adminSlate?.__typename === "QueryAdminSlateSuccess"
			? lockedData.adminSlate.data
			: null

	// Fixed context from the URL - set once, not re-derived on every render
	// (which would otherwise stomp label/slot as the admin types them).
	const appliedLockedSlateId = useRef<string | null>(null)
	useEffect(() => {
		if (lockedSlateId && appliedLockedSlateId.current !== lockedSlateId) {
			appliedLockedSlateId.current = lockedSlateId
			form.setValue("slate", {
				slateId: lockedSlateId,
				label: "",
				slot: undefined,
			})
		}
	}, [lockedSlateId, form])

	function selectSlate(slate: SelectedSlate) {
		form.setValue("slate", { slateId: slate.id, label: "", slot: undefined })
		setSelectedSlate(slate)
		setInputText("")
		setOpen(false)
		setHighlightedKey(null)
	}

	function clearSlate() {
		form.setValue("slate", undefined)
		setSelectedSlate(null)
		setInputText("")
	}

	function updateLabel(label: string) {
		form.setValue("slate", {
			slateId: slateValue?.slateId ?? "",
			label,
			slot: slateValue?.slot,
		})
	}

	function updateSlot(slot: string) {
		form.setValue("slate", {
			slateId: slateValue?.slateId ?? "",
			label: slateValue?.label ?? "",
			slot,
		})
	}

	const active = lockedSlateId
		? lockedSlate
			? {
					id: lockedSlate.id,
					name: lockedSlate.name,
					memberCount: lockedSlate.memberCount,
				}
			: null
		: selectedSlate

	return (
		<VStack gap="3" alignItems="stretch">
			<VStack gap="1.5" alignItems="stretch">
				<FieldLabel>Add to slate</FieldLabel>
				{active ? (
					<HStack
						justify="space-between"
						className={css({
							background: "bg.subtle",
							border: "1px solid {colors.border.default}",
							borderRadius: "lg",
							padding: "{spacing.2.5} {spacing.3}",
						})}
					>
						<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
							{active.name}{" "}
							<span className={css({ color: "fg.subtle" })}>
								· {active.memberCount} question
								{active.memberCount === 1 ? "" : "s"}
							</span>
						</span>
						{lockedSlateId ? (
							<Link
								to="/admin/slates/$slateId"
								params={{ slateId: lockedSlateId }}
								className={css({
									fontSize: "xs",
									color: "fg.subtle",
									textDecoration: "underline",
								})}
							>
								Back to slate
							</Link>
						) : (
							<button
								type="button"
								onClick={clearSlate}
								className={css({
									fontSize: "xs",
									color: "fg.subtle",
									textDecoration: "underline",
									cursor: "pointer",
								})}
							>
								Change slate
							</button>
						)}
					</HStack>
				) : leagueId ? (
					<div>
						<TextInput>
							<TextInput.Group>
								<TextInput.Field
									placeholder="Search slates in this league…"
									autoComplete="off"
									value={inputText}
									onChange={(event) => {
										setInputText(event.target.value)
										setHighlightedKey(null)
										setOpen(true)
									}}
									onFocus={() => setOpen(true)}
									onBlur={() => {
										setTimeout(() => setOpen(false), 150)
									}}
								/>
							</TextInput.Group>
						</TextInput>
						<Combobox
							open={open && results.length > 0}
							highlightedKey={highlightedKey}
							onHighlightChange={setHighlightedKey}
							onSelect={(key) => {
								const slate = results.find((s) => s.id === key)
								if (slate) selectSlate(slate)
							}}
						>
							{results.map((slate) => (
								<Combobox.Option
									key={slate.id}
									optionKey={slate.id}
									meta={`${slate.memberCount} question${slate.memberCount === 1 ? "" : "s"}`}
								>
									{slate.name}
								</Combobox.Option>
							))}
						</Combobox>
					</div>
				) : (
					<FieldHint>Pick a league above to search its slates.</FieldHint>
				)}
				<FieldHint>
					Optional - groups this question with related ones (a Gold Glove race's
					other positions, a week of games) so callers can navigate between
					them.
				</FieldHint>
			</VStack>

			{active && (
				<HStack gap="3" alignItems="flex-start">
					<form.Subscribe selector={(s) => s.errors["slate.label"] ?? null}>
						{(error) => (
							<TextInput
								error={error ?? undefined}
								className={css({ flex: 1 })}
							>
								<TextInput.Label required>Label</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										placeholder="First base"
										value={slateValue?.label ?? ""}
										onChange={(e) => updateLabel(e.target.value)}
									/>
								</TextInput.Group>
							</TextInput>
						)}
					</form.Subscribe>
					<form.Subscribe selector={(s) => s.errors["slate.slot"] ?? null}>
						{(error) => (
							<TextInput
								error={error ?? undefined}
								className={css({ width: "24" })}
							>
								<TextInput.Label>Slot</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										placeholder="1B"
										maxLength={8}
										value={slateValue?.slot ?? ""}
										onChange={(e) => updateSlot(e.target.value)}
									/>
								</TextInput.Group>
							</TextInput>
						)}
					</form.Subscribe>
				</HStack>
			)}
		</VStack>
	)
}
