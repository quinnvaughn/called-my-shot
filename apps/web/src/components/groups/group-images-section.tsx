import { VStack } from "styled-system/jsx"
import { ImageField } from "#/components/images/image-field"
import { Banner, BannerPlaceholder } from "#/components/ui/banner"
import { Card } from "#/components/ui/card"
import { GroupLogo } from "#/components/ui/group-logo"

type Props = {
	groupId: string
	groupName: string
	logoUrl: string | null
	bannerUrl: string | null
}

// Saved the moment a crop is confirmed, not with the General form: an upload
// has already happened by then, so there's nothing left to hold back.
export function GroupImagesSection({
	groupId,
	groupName,
	logoUrl,
	bannerUrl,
}: Props) {
	return (
		<Card size="sm" variant="surface">
			<Card.Body>
				<VStack gap="5" alignItems="stretch">
					<ImageField
						target={{ kind: "logo", groupId }}
						preview={<GroupLogo size="lg" name={groupName} src={logoUrl} />}
						hasImage={!!logoUrl}
						title="Group logo"
						hint="Shows next to the group's name."
					/>
					<ImageField
						target={{ kind: "banner", groupId }}
						preview={
							bannerUrl ? <Banner src={bannerUrl} /> : <BannerPlaceholder />
						}
						hasImage={!!bannerUrl}
						title="Group banner"
						hint="Runs across the top of the group page and its invite link."
						stacked
					/>
				</VStack>
			</Card.Body>
		</Card>
	)
}
