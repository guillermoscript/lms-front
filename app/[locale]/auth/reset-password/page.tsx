import ResetPasswordForm from '@/components/auth/ResetPasswordForm'

export default function ResetPassword({
    searchParams,
}: {
    searchParams: {
        message: string
        error: string
        code: string
    }
}) {
    return (
        <ResetPasswordForm searchParams={searchParams} />
    )
}
