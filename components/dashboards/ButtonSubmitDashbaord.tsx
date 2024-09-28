'use client'
import { Loader } from 'lucide-react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'

export default function ButtonSubmitDashbaord () {
    const { pending } = useFormStatus()
    return (
        <Button type="submit" disabled={pending}>
            {pending ? (
                <Loader className='h-4 w-4 animate-spin' />
            ) : 'Submit'}
        </Button>
    )
}
