import { POST_BODY_MAX } from "@called-my-shot/schemas"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Textarea } from "#/components/ui/textarea"
import { RoomLeft } from "./room-left"

// The words that go with a post as a whole, under its picks. The
// placeholder suggests what to write for the kind of post.
export function PostBodyField({
	value,
	onChange,
	error,
	placeholder = "Who just missed the cut, or the case for your four. Shown under the faces.",
}: {
	value: string
	onChange: (value: string) => void
	error?: string
	placeholder?: string
}) {
	return (
		<Textarea error={error}>
			<HStack justify="space-between" gap="2">
				<Textarea.Label>Anything else to say? (optional)</Textarea.Label>
				<RoomLeft value={value} max={POST_BODY_MAX} within={100} />
			</HStack>
			<Textarea.Field
				rows={8}
				// Room for a real paragraph before it starts growing.
				className={css({ minHeight: "48" })}
				maxLength={POST_BODY_MAX}
				value={value}
				placeholder={placeholder}
				onChange={(event) => onChange(event.target.value)}
			/>
		</Textarea>
	)
}
