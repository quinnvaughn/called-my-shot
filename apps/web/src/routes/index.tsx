import { createFileRoute } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { LandingPageNav } from "#/components/landing-page/landing-page-nav"
import { LandingPageWrap } from "#/components/landing-page/landing-page-wrap"

export const Route = createFileRoute("/")({
	component: Home,
})

function Home() {
	return (
		<div>
			<LandingPageNav />
			<header className={css({ padding: "{spacing.16} 0 {spacing.20}" })}>
				<LandingPageWrap
					className={css({
						display: "grid",
						gridTemplateColumns: { base: "1fr", lg: "1fr 1fr" },
					})}
				>
					<div>Hi</div>
					<div>Hello</div>
				</LandingPageWrap>
			</header>
		</div>
	)
}
