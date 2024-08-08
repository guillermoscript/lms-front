'use server'
import { revalidatePath } from 'next/cache'

import { createResponse } from '@/utils/functions'
import { createClient } from '@/utils/supabase/server'

export const createSupportTicket = async ({
    title,
    description,
    issues,
}: {
    title: string
    description: string
    issues: string[]
}) => {
    const supabase = createClient()

    const { data, error } = await supabase.auth.getUser()

    if (error) {
        return createResponse('error', 'You must be logged in to submit a support ticket', null)
    }

    if (!title) {
        return createResponse('error', 'No title was submitted', null)
    }

    if (!description) {
        return createResponse('error', 'No description was submitted', null)
    }

    if (!issues) {
        return createResponse('error', 'No issues were submitted', null)
    }

    const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .insert({
            title,
            description: `${description} \n\nIssues: ${issues.join(', ')}`,
            user_id: data?.user.id,
        })

    if (ticketError) {
        console.log(ticketError)
    }

    if (ticketData) {
        revalidatePath('/contact/support')
    }

    return createResponse('success', 'Ticket submitted successfully', ticketData)
}
