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

// Flat selection rather than per-component fragments - there's no group
// detail UI built yet to anchor fragment names to. Split this into
// component fragments (à la GroupCard_group) once that UI exists.
export const GroupDetailDocument = graphql(`
    query GroupDetail(
        $groupId: ID!
        $answeredAfter: String
        $createdAfter: String
        $sharedAfter: String
    ) {
        group(id: $groupId) {
            id
            name
            memberCount
            viewerIsAdmin
            viewerRank
            myInvite {
                id
                code
                expiresAt
            }
            leaderboard {
                rank
                role
                totalPoints
                accuracy
                callCount
                resolvedCallCount
                user {
                    id
                    name
                    username
                }
            }
            answeredQuestions(first: 10, after: $answeredAfter) {
                items {
                    id
                    createdAt
                    guessValue
                    totalPoints
                    selections {
                        id
                        fieldPctAtCall
                        resultPoints
                        option {
                            id
                            label
                            isCorrect
                        }
                    }
                    question {
                        id
                        title
                        type
                        locksAt
                        status
                        numericActualValue
                        numericTolerancePct
                        creator {
                            id
                            name
                            username
                        }
                    }
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
            createdQuestions(first: 10, after: $createdAfter) {
                items {
                    id
                    title
                    category
                    isOfficial
                    type
                    locksAt
                    status
                    callCount
                    ouLine
                    creator {
                        id
                        name
                        username
                    }
                    options {
                        id
                        label
                        fieldPct
                    }
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
            sharedQuestions(first: 10, after: $sharedAfter) {
                items {
                    id
                    createdAt
                    sharedBy {
                        id
                        name
                        username
                    }
                    question {
                        id
                        title
                        category
                        isOfficial
                        type
                        locksAt
                        status
                        callCount
                        ouLine
                        creator {
                            id
                            name
                            username
                        }
                        options {
                            id
                            label
                            fieldPct
                        }
                    }
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
    }
`)
