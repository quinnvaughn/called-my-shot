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
	AdminBallotDocument,
	AdminBallotSearchDocument,
} from "#/graphql/queries/ballots"
import type { CreateQuestionFormApi } from "./form-types"

type Props = {
	form: CreateQuestionFormApi
	leagueId: string
	// Set when arriving from the admin Ballots builder's "+ New Question"
	// button (?ballotId=... on /new-question) - the ballot is fixed context
	// here, not something re-searched. See new-question.tsx's validateSearch.
	lockedBallotId?: string
}

const DEBOUNCE_MS = 250

type SelectedBallot = { id: string; name: string; memberCount: number }

// Admin-only placement into a Ballot - a search/autocomplete over existing
// ballots scoped to the question's own league, deliberately NOT a <select>
// (a ballot list is unbounded and a dropdown doesn't scale or explain itself
// the way a search result row can). Once a ballot is picked, reveals exactly
// two more fields (label required, slot optional) - no reorder/position
// preview here, new questions just append to the end of the ballot.
//
// Reads/writes the whole `ballot` value as one object (never a dotted
// "ballot.label" path) - the form hook's Path/PathValue generics can't
// correctly type a nested field under an optional object (keyof on a
// `T | undefined` union collapses to never), so every update here goes
// through the one top-level path that works.
export function BallotField({ form, leagueId, lockedBallotId }: Props) {
	const ballotValue = form.useWatch("ballot")
	const ballotId = ballotValue?.ballotId
	const [inputText, setInputText] = useState("")
	const [open, setOpen] = useState(false)
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
	const [debouncedQuery, setDebouncedQuery] = useState("")
	const [selectedBallot, setSelectedBallot] = useState<SelectedBallot | null>(
		null,
	)

	useEffect(() => {
		const id = setTimeout(
			() => setDebouncedQuery(inputText.trim()),
			DEBOUNCE_MS,
		)
		return () => clearTimeout(id)
	}, [inputText])

	// A league change invalidates whatever ballot was picked under the old one
	// (the server rejects a cross-league ballot at submit time anyway) - same
	// pattern as GameField clearing gameId on a league change. Locked ballots
	// (arrived via ?ballotId=) skip this - that context is fixed regardless of
	// what the league field happens to show.
	const prevLeagueId = useRef(leagueId)
	useEffect(() => {
		if (prevLeagueId.current !== leagueId) {
			prevLeagueId.current = leagueId
			if (!lockedBallotId && ballotId) {
				form.setValue("ballot", undefined)
				setSelectedBallot(null)
			}
		}
	}, [leagueId, lockedBallotId, ballotId, form])

	const { data: searchData } = useQuery(AdminBallotSearchDocument, {
		variables: { leagueId, query: debouncedQuery || undefined },
		skip: !leagueId || !!lockedBallotId || !!ballotId,
	})
	const results =
		searchData?.adminBallotSearch.__typename === "QueryAdminBallotSearchSuccess"
			? searchData.adminBallotSearch.data
			: []

	// Resolves the locked ballot's own display name/count - the create form
	// never fetched it otherwise, since arriving here skips the search step.
	const { data: lockedData } = useQuery(AdminBallotDocument, {
		variables: { id: lockedBallotId ?? "" },
		skip: !lockedBallotId,
	})
	const lockedBallot =
		lockedData?.adminBallot?.__typename === "QueryAdminBallotSuccess"
			? lockedData.adminBallot.data
			: null

	// Fixed context from the URL - set once, not re-derived on every render
	// (which would otherwise stomp label/slot as the admin types them).
	const appliedLockedBallotId = useRef<string | null>(null)
	useEffect(() => {
		if (lockedBallotId && appliedLockedBallotId.current !== lockedBallotId) {
			appliedLockedBallotId.current = lockedBallotId
			form.setValue("ballot", {
				ballotId: lockedBallotId,
				label: "",
				slot: undefined,
			})
		}
	}, [lockedBallotId, form])

	function selectBallot(ballot: SelectedBallot) {
		form.setValue("ballot", {
			ballotId: ballot.id,
			label: "",
			slot: undefined,
		})
		setSelectedBallot(ballot)
		setInputText("")
		setOpen(false)
		setHighlightedKey(null)
	}

	function clearBallot() {
		form.setValue("ballot", undefined)
		setSelectedBallot(null)
		setInputText("")
	}

	function updateLabel(label: string) {
		form.setValue("ballot", {
			ballotId: ballotValue?.ballotId ?? "",
			label,
			slot: ballotValue?.slot,
		})
	}

	function updateSlot(slot: string) {
		form.setValue("ballot", {
			ballotId: ballotValue?.ballotId ?? "",
			label: ballotValue?.label ?? "",
			slot,
		})
	}

	const active = lockedBallotId
		? lockedBallot
			? {
					id: lockedBallot.id,
					name: lockedBallot.name,
					memberCount: lockedBallot.memberCount,
				}
			: null
		: selectedBallot

	return (
		<VStack gap="3" alignItems="stretch">
			<VStack gap="1.5" alignItems="stretch">
				<FieldLabel>Add to ballot</FieldLabel>
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
						{lockedBallotId ? (
							<Link
								to="/admin/ballots/$ballotId"
								params={{ ballotId: lockedBallotId }}
								className={css({
									fontSize: "xs",
									color: "fg.subtle",
									textDecoration: "underline",
								})}
							>
								Back to ballot
							</Link>
						) : (
							<button
								type="button"
								onClick={clearBallot}
								className={css({
									fontSize: "xs",
									color: "fg.subtle",
									textDecoration: "underline",
									cursor: "pointer",
								})}
							>
								Change ballot
							</button>
						)}
					</HStack>
				) : leagueId ? (
					<div>
						<TextInput>
							<TextInput.Group>
								<TextInput.Field
									placeholder="Search ballots in this league…"
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
								const ballot = results.find((b) => b.id === key)
								if (ballot) selectBallot(ballot)
							}}
						>
							{results.map((ballot) => (
								<Combobox.Option
									key={ballot.id}
									optionKey={ballot.id}
									meta={`${ballot.memberCount} question${ballot.memberCount === 1 ? "" : "s"}`}
								>
									{ballot.name}
								</Combobox.Option>
							))}
						</Combobox>
					</div>
				) : (
					<FieldHint>Pick a league above to search its ballots.</FieldHint>
				)}
				<FieldHint>
					Optional - groups this question with related ones (a Gold Glove race's
					other positions, a week of games) so callers can navigate between
					them.
				</FieldHint>
			</VStack>

			{active && (
				<HStack gap="3" alignItems="flex-start">
					<form.Subscribe selector={(s) => s.errors["ballot.label"] ?? null}>
						{(error) => (
							<TextInput
								error={error ?? undefined}
								className={css({ flex: 1 })}
							>
								<TextInput.Label required>Label</TextInput.Label>
								<TextInput.Group>
									<TextInput.Field
										placeholder="First base"
										value={ballotValue?.label ?? ""}
										onChange={(e) => updateLabel(e.target.value)}
									/>
								</TextInput.Group>
							</TextInput>
						)}
					</form.Subscribe>
					<form.Subscribe selector={(s) => s.errors["ballot.slot"] ?? null}>
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
										value={ballotValue?.slot ?? ""}
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
