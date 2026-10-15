import type { QuestionDetailQuery } from "#/graphql/generated/graphql"
import type { ViewerStatus } from "#/lib/viewer-status"

export type QuestionDetail = NonNullable<QuestionDetailQuery["question"]>

export type QuestionDetailStatus = ViewerStatus<
	NonNullable<QuestionDetail["viewerCall"]>
>
