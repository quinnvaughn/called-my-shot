import { graphql } from "#/graphql/generated"

export const MyGroupsDocument = graphql(`
    query MyGroups {
        myGroups {
            id
            ...GroupCard_group
        }
    }
`)
