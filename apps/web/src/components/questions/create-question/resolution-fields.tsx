import { HStack, VStack } from "styled-system/jsx"
import { TextInput } from "#/components/ui/text-input"
import { ChipButton } from "./chip-button"
import type { CreateQuestionFormApi } from "./form-types"

const SOURCE_SUGGESTIONS = [
	"ESPN box score",
	"League official result",
	"Official league stats site",
]

type Props = {
	form: CreateQuestionFormApi
}

export function ResolutionFields({ form }: Props) {
	return (
		<VStack gap="3.5" alignItems="stretch">
			<form.Field name="resolutionSource">
				{(field) => (
					<VStack gap="2" alignItems="stretch">
						<TextInput error={field.meta.error ?? undefined}>
							<TextInput.Label required>Resolution source</TextInput.Label>
							<TextInput.Group>
								<TextInput.Field
									placeholder="e.g. ESPN box score"
									aria-required
									value={field.value}
									onChange={field.onChange}
									onBlur={field.onBlur}
								/>
							</TextInput.Group>
						</TextInput>
						<HStack gap="1.5" flexWrap="wrap">
							{SOURCE_SUGGESTIONS.map((suggestion) => (
								<ChipButton
									key={suggestion}
									onClick={() => field.onChange(suggestion)}
								>
									{suggestion}
								</ChipButton>
							))}
						</HStack>
					</VStack>
				)}
			</form.Field>

			<form.Field name="resolutionSourceUrl">
				{(field) => (
					<TextInput error={field.meta.error ?? undefined}>
						<TextInput.Label>Source URL (optional)</TextInput.Label>
						<TextInput.Group>
							<TextInput.Field
								placeholder="https://…"
								value={field.value}
								onChange={field.onChange}
								onBlur={field.onBlur}
							/>
						</TextInput.Group>
					</TextInput>
				)}
			</form.Field>

			<form.Field name="locksAt">
				{(field) => (
					<TextInput
						error={field.meta.error ?? undefined}
						description="Locked the moment this publishes — the source can't change after someone's made a call."
					>
						<TextInput.Label required>Locks at</TextInput.Label>
						<TextInput.Group>
							<TextInput.Field
								type="datetime-local"
								aria-required
								value={field.value}
								onChange={field.onChange}
								onBlur={field.onBlur}
							/>
						</TextInput.Group>
					</TextInput>
				)}
			</form.Field>
		</VStack>
	)
}
