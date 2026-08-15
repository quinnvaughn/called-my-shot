import { css } from "styled-system/css"

// Shared by TextInput.Label, Textarea.Label, and FieldLabel - a required
// field's label ends with this, nothing else marks required-ness anywhere
// in the form (no native `required` attribute, since the submit button is
// already disabled until the schema validates - this is purely the visual
// cue that was otherwise entirely absent).
export function RequiredMark() {
	return (
		<span aria-hidden className={css({ color: "danger.default" })}>
			{" "}
			*
		</span>
	)
}
