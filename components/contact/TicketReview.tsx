import { Card, CardContent } from '@/components/ui/card'

interface Attachment {
    src: string;
    alt: string;
}

interface TicketReviewProps {
    title: string;
    description: string;
    // attachments: Attachment[];
}

const TicketSection = ({ title, content }: { title: string; content: React.ReactNode }) => (
    <div>
        <h3 className="text-lg font-medium text-foreground">{title}</h3>
        <p>{content}</p>
    </div>
)

const Attachments = ({ attachments }: { attachments: Attachment[] }) => (
    <div className="grid grid-cols-3 gap-4">
        {attachments.map((attachment, index) => (
            <img
                key={index}
                src={attachment.src}
                width="100"
                height="100"
                alt={attachment.alt}
                className="rounded-md"
                style={{ aspectRatio: '100/100', objectFit: 'cover' }}
            />
        ))}
    </div>
)

const TicketReview = ({ title, description }: TicketReviewProps) => (
    
        <Card>
            <CardContent>
                <div className="space-y-4">
                    <TicketSection title="Title" content={title} />
                    <TicketSection title="Description" content={description} />
                    {/* <div>
                        <h3 className="text-lg font-medium text-foreground">Attachments</h3>
                        <Attachments attachments={attachments} />
                    </div> */}
                </div>
            </CardContent>
        </Card>
)

export default TicketReview
