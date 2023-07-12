export const CONTACT_EMAIL = "arepayquezo@gmail.com"

export const ROUTES = {
    auth: {
        login: "/auth/login",
        register: "/auth/create-account",
        logout: "/auth/logout",
        forgotPassword: "/auth/recover-password",
        resetPassword: "/auth/reset-password",
        verifyEmail: "/auth/verify-email",
        resendVerificationEmail: "/auth/resend-verification-email",
    },
    dashboard: {
        account: "/dashboard/account",
        admin: "/dashboard/admin",
        order: "/dashboard/order",
    }
}