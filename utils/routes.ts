export const routes = {
    api: {
        
    },
    pages: {
        auth: {
            login: '/login',
            createAccount: '/create-account',
            recoverPassword: '/recover-password',
            resetPassword: '/reset-password',
            logout: '/logout',
        },
        home: '/',
        dashboard: {
            index: '/dashboard',
            account: {
                index: '/dashboard/account',
                edit: '/dashboard/account/profile',
                payment: '/dashboard/account/payment',
                
            },
            billing: '/dashboard/billing',
            subscriptions: '/dashboard/subscriptions',
            orders: '/dashboard/orders',
        }        
    }
}