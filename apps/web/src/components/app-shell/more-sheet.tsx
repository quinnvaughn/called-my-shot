import { FiLogIn, FiSettings } from "react-icons/fi"
import { css } from "styled-system/css"
import { AuthModal } from "#/components/auth/auth-modal"
import { Sheet } from "#/components/ui/sheet"
import { closeModal, openModal } from "#/stores/modal-store"
import { sidebarLeading, sidebarRow } from "./sidebar-row"
import { SocialLinks } from "./social-links"
import { SpaceSectionList } from "./space-section-list"
import { resourceSections } from "./space-sections"

// The bottom nav's More tab: what the side column's Resources section holds
// on desktop, plus Settings, on a screen with no side column.
export function MoreSheet({ signedIn }: { signedIn: boolean }) {
	const sections = signedIn
		? [
				...resourceSections(true),
				{ label: "Settings", icon: FiSettings, to: "/settings" },
			]
		: resourceSections(false)

	return (
		<Sheet>
			<Sheet.Header>
				<Sheet.Title>More</Sheet.Title>
				<Sheet.CloseButton />
			</Sheet.Header>
			<Sheet.Body
				className={css({ display: "flex", flexDirection: "column", gap: "4" })}
			>
				<SpaceSectionList sections={sections} onNavigate={closeModal} />
				{!signedIn && (
					<button
						type="button"
						className={sidebarRow}
						onClick={() => {
							closeModal()
							openModal(<AuthModal defaultView="signin" />)
						}}
					>
						<span className={sidebarLeading}>
							<FiLogIn size={18} />
						</span>
						Log in
					</button>
				)}
				<div
					className={css({
						paddingTop: "3",
						borderTop: "1px solid {colors.border.default}",
					})}
				>
					<SocialLinks />
				</div>
			</Sheet.Body>
		</Sheet>
	)
}
