import { css } from "styled-system/css"
import { AuthModal } from "#/components/auth/auth-modal"
import { Button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"
import { AccountMenu } from "./account-menu"
import { SocialLinks } from "./social-links"
import type { Me } from "./types"

export function SidebarFooter({ me }: { me: Me }) {
	return (
		<div
			className={css({
				marginTop: "auto",
				paddingTop: "8",
				display: "flex",
				flexDirection: "column",
				gap: "4",
			})}
		>
			<SocialLinks />
			{me ? (
				<div className={css({ display: { base: "none", md: "block" } })}>
					<AccountMenu
						name={me.name}
						username={me.username}
						avatarUrl={me.avatarUrl}
						variant="sidebar"
					/>
				</div>
			) : (
				<div
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "2",
					})}
				>
					<Button
						variant="solid"
						size="sm"
						fullWidth
						onClick={() => openModal(<AuthModal defaultView="signup" />)}
					>
						Sign up
					</Button>
					<Button
						variant="outline"
						size="sm"
						fullWidth
						onClick={() => openModal(<AuthModal defaultView="signin" />)}
					>
						Log in
					</Button>
				</div>
			)}
		</div>
	)
}
