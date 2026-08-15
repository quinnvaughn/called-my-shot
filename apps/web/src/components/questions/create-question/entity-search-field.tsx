import { useRef, useState } from "react"
import { Combobox } from "#/components/ui/combobox"
import { TextInput } from "#/components/ui/text-input"

export type EntitySearchItem = {
	id: string
	label: string
	kind: "team" | "player" | "stat" | "league"
	meta?: string
}

type Props = {
	value: string
	onValueChange: (text: string) => void
	// null = no fixed vocabulary for the current selection (e.g. category
	// "Other") - the field stays a plain freeform text input with no dropdown.
	items: EntitySearchItem[] | null
	onSelectItem: (item: EntitySearchItem) => void
	placeholder?: string
	error?: string
	required?: boolean
}

const MAX_MATCHES = 6

// The label input IS the search trigger - typing filters a dropdown of real
// teams/players inline, same input, rather than a separate search box next
// to a separate freeform field. Reused by option rows (multiple choice
// options, multi-select pool) and the numeric/O-U subject picker.
export function EntitySearchField({
	value,
	onValueChange,
	items,
	onSelectItem,
	placeholder,
	error,
	required,
}: Props) {
	const [open, setOpen] = useState(false)
	const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
	const wrapRef = useRef<HTMLDivElement>(null)

	const query = value.trim().toLowerCase()
	const matches =
		items && query
			? items
					.filter((item) => item.label.toLowerCase().includes(query))
					.slice(0, MAX_MATCHES)
			: []

	function selectItem(item: EntitySearchItem) {
		onSelectItem(item)
		setOpen(false)
		setHighlightedKey(null)
	}

	return (
		<div ref={wrapRef} style={{ position: "relative" }}>
			<TextInput error={error}>
				<TextInput.Group>
					<TextInput.Field
						placeholder={placeholder}
						autoComplete="off"
						aria-required={required}
						value={value}
						onChange={(event) => {
							onValueChange(event.target.value)
							setHighlightedKey(null)
							setOpen(true)
						}}
						onFocus={() => setOpen(true)}
						onBlur={() => {
							// Let a dropdown click register before the blur closes it.
							setTimeout(() => setOpen(false), 150)
						}}
					/>
				</TextInput.Group>
			</TextInput>
			<Combobox
				open={open && matches.length > 0}
				highlightedKey={highlightedKey}
				onHighlightChange={setHighlightedKey}
				onSelect={(key) => {
					const item = matches.find((m) => m.id === key)
					if (item) selectItem(item)
				}}
			>
				{matches.map((item) => (
					<Combobox.Option key={item.id} optionKey={item.id} meta={item.meta}>
						{item.label}
					</Combobox.Option>
				))}
			</Combobox>
		</div>
	)
}
