import { CallCard } from "#/components/questions/call-card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"

export const MyCallsTabFragment = graphql(`
	fragment MyCallsTab_call on Call {
		id
		...CallCard_call
	}
`)

type MyCallItem = { id: string } & FragmentType<typeof MyCallsTabFragment>

export function MyCallCard({ call }: { call: MyCallItem }) {
	const data = useFragment(MyCallsTabFragment, call)
	return <CallCard call={data} />
}
