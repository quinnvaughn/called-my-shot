import { FiUserX } from "react-icons/fi"
import { IncorrectGroup } from "#/components/groups/incorrect-group"

export function IncorrectUser() {
	return (
		<IncorrectGroup
			icon={<FiUserX size="24" />}
			eyebrowText="Profile"
			heading="This user doesn't exist"
			subtitle="They may have changed their username, or the link's just wrong. Double check the URL."
			link={{ text: "View the leaderboard", url: "/leaderboard" }}
		/>
	)
}
