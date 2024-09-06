'use client'

import { Provider } from 'jotai'

export const JotaiProvider = ({ children }) => {
    return (
        <Provider>
            {children}
        </Provider>
    )
}
