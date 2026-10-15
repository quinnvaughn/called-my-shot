import { useState } from "react"
import { TextInput } from "#/components/ui/text-input"
import { subtleLinkClass } from "./styles"

// The invite code row on signup. A friend's code is worth a redo to both
// people, so it can't be buried, but it's blank for most signups and a sixth
// empty box reads as more work to create an account.
export function InviteCodeField({
	value,
	onChange,
	onBlur,
	error,
}: {
	value: string
	onChange: (next: string) => void
	onBlur: () => void
	error?: string
}) {
	const [open, setOpen] = useState(false)

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={subtleLinkClass}
			>
				Got an invite code?
			</button>
		)
	}

	return (
		<TextInput error={error} description="You both get a redo.">
			<TextInput.Label>Invite code</TextInput.Label>
			<TextInput.Group>
				<TextInput.Field
					type="text"
					placeholder="ABC123"
					autoCapitalize="characters"
					autoComplete="off"
					value={value}
					// Uppercased as it's typed so the field matches the codes
					// people are reading off a screen. The server normalizes
					// too; this is only so it doesn't look wrong while typing.
					onChange={(e) => onChange(e.target.value.toUpperCase())}
					onBlur={onBlur}
				/>
			</TextInput.Group>
		</TextInput>
	)
}
