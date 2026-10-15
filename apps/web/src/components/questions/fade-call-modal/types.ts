export type FadeCallModalProps = {
	callId: string
	questionId: string
	opUsername: string
	// Both formatted the way the call page states a pick.
	opPickLabel: string
	pickLabel: string
	optionId: string
	mode: "NEW" | "ATTACH"
}
