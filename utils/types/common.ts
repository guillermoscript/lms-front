import { User } from "../../payload-types"

export type PaginatedDocs<T> = {
    docs: T[]
    totalDocs: number
    limit: number
    totalPages: number
    page: number
    pagingCounter: number
    hasPrevPage: boolean
    hasNextPage: boolean
    prevPage: any
    nextPage: any
}

export type UserMeResponse = {
    user: User
    collection: string
    token: string
    exp: number
}


export type IndexPageRef = React.ForwardedRef<HTMLDivElement>