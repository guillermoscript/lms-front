import TicketReview from '@/components/contact/TicketReview'
import SupportTicket from '@/components/form/SupportTicket'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/utils/supabase/server'

export default async function SupportTicketPage() {
    const supabase = createClient()

    const { data, error } = await supabase.auth.getUser()

    if (error) {
        throw new Error('Not authenticated')
    }

    const ticketData = await supabase
        .from('tickets')
        .select('*')
        .eq('user_id', data?.user.id)

    return (
        <div className="flex flex-col gap-4 p-4 lg:p-8">
            <SupportTicket />
            <Separator />
            <div className="w-full max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8 flex flex-col gap-4">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Review Your Ticket</h2>
                {ticketData.data?.length > 0
                    ? ticketData.data?.map((ticket) => (
                        <TicketReview
                            key={ticket.ticket_id}
                            title={ticket.title}
                            description={ticket.description}
                        />
                    )) : (
                        <p
                            className="text-center text-gray-500 font-medium"
                        >No tickets found, create a new ticket to get started</p>
                    )}
            </div>
        </div>
    )
}
