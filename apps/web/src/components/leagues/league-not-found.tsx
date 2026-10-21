import { FaRegTimesCircle } from "react-icons/fa"
import { NotFound } from "#/components/ui/not-found"

export function LeagueNotFound() {
	return (
		<NotFound
			icon={<FaRegTimesCircle size={24} />}
			eyebrowText="League"
			heading="This league doesn't exist"
			subtitle="Double check the link, or pick a league from Spaces."
			link={{ text: "Back home", url: "/home" }}
		/>
	)
}
