import { useQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { FormError } from "#/components/ui/form-error"
import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"
import { FadeCallForm } from "./fade-call-form"
import type { FadeCallModalProps } from "./types"

// The call page doesn't carry the cast form's question fields, and most
// visitors never fade, so they're fetched when the modal opens.
const FadeCallQuestionDocument = graphql(`
	query FadeCallQuestion($id: ID!) {
		question(id: $id) {
			id
			...CastCallForm_question
		}
	}
`)

export function NewFade(props: FadeCallModalProps) {
	const { data, isPending } = useQuery(
		gqlQueryOptions(FadeCallQuestionDocument, { id: props.questionId }),
	)

	if (isPending) {
		return (
			<p className={css({ fontSize: "sm", color: "fg.subtle" })}>Loading…</p>
		)
	}
	if (!data?.question) {
		return <FormError message="This question couldn't be loaded." />
	}
	return (
		<FadeCallForm {...props} question={data.question} surface="call_page" />
	)
}
