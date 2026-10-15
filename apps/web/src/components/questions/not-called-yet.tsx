import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { MemberStateIcon } from "#/components/questions/member-state-icon"
import type { BallotMemberState } from "#/lib/ballot-member-state"

export function NotCalledYet({ state }: { state: BallotMemberState }) {
	return (
		<HStack gap="2" alignItems="center">
			<MemberStateIcon state={state} />
			<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
				Not called yet
			</span>
		</HStack>
	)
}
