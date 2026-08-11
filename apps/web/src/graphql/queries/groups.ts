import { graphql } from "#/graphql/generated"

export const MyGroupsDocument = graphql(`
    query MyGroups {
        myGroups {
            id
            ...GroupCard_group
        }
    }
`)

export const GroupPreviewDocument = graphql(`
    query GroupPreview($code: String!) {
        groupPreview(code: $code) {
            id
            name
            memberCount
            invitedBy {
                name
                username
            }
            members {
                id
                name
            }
            topScorer {
                name
                username
                points
            }
        }
    }
`)
