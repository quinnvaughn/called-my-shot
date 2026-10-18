import { FiPlus } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { button } from "#/components/ui/button"
import { Textarea } from "#/components/ui/textarea"
import { useCastCallFormContext } from "./cast-call-form-context"

// Shared by every question type - the one field that isn't part of the
// call itself. A single line until it's wanted (see caseOpen).
export function CaseField() {
	const { form, caseTextRef, caseOpen, focusCaseText } =
		useCastCallFormContext()

	if (!caseOpen) {
		return (
			<button
				type="button"
				onClick={focusCaseText}
				className={cx(
					button({ variant: "outline", size: "sm" }),
					css({ alignSelf: "flex-start" }),
				)}
			>
				<FiPlus size={14} />
				Add a case
			</button>
		)
	}

	return (
		<form.Field name="caseText">
			{(field) => (
				<Textarea error={field.meta.error ?? undefined}>
					<Textarea.Label>Make your case (optional)</Textarea.Label>
					<Textarea.Field
						ref={caseTextRef}
						placeholder="Why this call?"
						maxLength={600}
						value={field.value}
						onChange={field.onChange}
						onBlur={field.onBlur}
					/>
					<Textarea.CharCount value={field.value} max={600} />
				</Textarea>
			)}
		</form.Field>
	)
}
