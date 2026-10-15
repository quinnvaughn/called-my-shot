import { VStack } from "styled-system/jsx"
import { ImageField } from "#/components/images/image-field"
import { Avatar } from "#/components/ui/avatar"
import { Banner } from "#/components/ui/banner"
import { BannerPlaceholder } from "#/components/ui/banner-placeholder"
import { Card } from "#/components/ui/card"

type Props = {
	name: string
	avatarUrl: string | null
	bannerUrl: string | null
}

export function ProfileImagesSection({ name, avatarUrl, bannerUrl }: Props) {
	return (
		<Card size="sm" variant="surface">
			<Card.Body>
				<VStack gap="5" alignItems="stretch">
					<ImageField
						target={{ kind: "avatar" }}
						preview={<Avatar size="lg" name={name} src={avatarUrl} />}
						hasImage={!!avatarUrl}
						title="Avatar"
						hint="Shows next to your name on calls, leaderboards and groups."
					/>
					<ImageField
						target={{ kind: "user_banner" }}
						preview={
							bannerUrl ? <Banner src={bannerUrl} /> : <BannerPlaceholder />
						}
						hasImage={!!bannerUrl}
						title="Profile banner"
						hint="Runs across the top of your profile."
						stacked
					/>
				</VStack>
			</Card.Body>
		</Card>
	)
}
