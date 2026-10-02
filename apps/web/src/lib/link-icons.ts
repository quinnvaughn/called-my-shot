import type { LinkPlatformId } from "@called-my-shot/schemas"
import type { IconType } from "react-icons"
import {
	FaBluesky,
	FaDiscord,
	FaFacebook,
	FaInstagram,
	FaLinkedin,
	FaPatreon,
	FaReddit,
	FaSnapchat,
	FaSpotify,
	FaThreads,
	FaTiktok,
	FaTwitch,
	FaXTwitter,
	FaYoutube,
} from "react-icons/fa6"
import { FiGlobe } from "react-icons/fi"
import { SiKick, SiSubstack } from "react-icons/si"

// Keyed on every platform LINK_PLATFORMS knows, so adding one there doesn't
// typecheck until it has an icon here. Font Awesome where it has the brand,
// Simple Icons for the ones it doesn't.
export const linkIcons: Record<LinkPlatformId | "website", IconType> = {
	x: FaXTwitter,
	instagram: FaInstagram,
	tiktok: FaTiktok,
	youtube: FaYoutube,
	twitch: FaTwitch,
	kick: SiKick,
	discord: FaDiscord,
	reddit: FaReddit,
	bluesky: FaBluesky,
	threads: FaThreads,
	facebook: FaFacebook,
	snapchat: FaSnapchat,
	linkedin: FaLinkedin,
	patreon: FaPatreon,
	substack: SiSubstack,
	spotify: FaSpotify,
	website: FiGlobe,
}
