'use client'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'

export default function ButtonSubmitDashbaord () {
    const { pending } = useFormStatus()
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Submitting...' : 'Submit'}
        </Button>
    )
}
