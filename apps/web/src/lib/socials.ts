import type { IconType } from "react-icons"
import { linkIcons } from "#/lib/link-icons"

type Social = { label: string; url: string; icon: IconType }

// Called My Shot's own accounts, linked from the sidebar.
export const SOCIALS: Social[] = [
	{
		label: "Discord",
		url: "https://discord.gg/TWtFUbp7mX",
		icon: linkIcons.discord,
	},
	{ label: "X", url: "https://x.com/calledmyshot", icon: linkIcons.x },
]
