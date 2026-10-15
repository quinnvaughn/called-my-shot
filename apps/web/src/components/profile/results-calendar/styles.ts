import type { CalendarLevel, CalendarSide } from "@called-my-shot/scoring"
import { css } from "styled-system/css"

// One class per shade, written out so Panda can see every one of them. The
// opacities match the og:image's blend over the card surface (see
// share-cards/profile-card.ts in the api), so the page and its unfurl shade a
// day alike.
export const TONE_CLASS: Record<`${CalendarSide}${CalendarLevel}`, string> = {
	up1: css({ bg: "success.default/35" }),
	up2: css({ bg: "success.default/55" }),
	up3: css({ bg: "success.default/80" }),
	up4: css({ bg: "success.default" }),
	down1: css({ bg: "danger.default/35" }),
	down2: css({ bg: "danger.default/55" }),
	down3: css({ bg: "danger.default/80" }),
	down4: css({ bg: "danger.default" }),
	even1: css({ bg: "fg.subtle" }),
	even2: css({ bg: "fg.subtle" }),
	even3: css({ bg: "fg.subtle" }),
	even4: css({ bg: "fg.subtle" }),
	pending1: css({
		bg: "bg.subtle",
		border: "2px solid {colors.border.emphasized}",
	}),
	pending2: css({
		bg: "bg.subtle",
		border: "2px solid {colors.border.emphasized}",
	}),
	pending3: css({
		bg: "bg.subtle",
		border: "2px solid {colors.border.emphasized}",
	}),
	pending4: css({
		bg: "bg.subtle",
		border: "2px solid {colors.border.emphasized}",
	}),
}

export const mono = css({
	textStyle: "label",
	color: "fg.muted",
})
