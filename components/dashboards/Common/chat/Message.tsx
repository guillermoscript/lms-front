import { cn } from '@/utils'

const Message = ({
    sender,
    time,
    isUser,
    children
}: {
    sender: string
    time?: string
    isUser: boolean
    children?: React.ReactNode
}) => {
    if (sender !== 'user' && sender !== 'assistant') {
        return null
    }
    return (
        <div
            className={cn(
                'flex w-full border-b p-1 mb-4 relative',
                isUser ? 'justify-end ' : 'justify-start'
            )}
        >
            <div className="flex items-end w-full">
                <div className="flex flex-col w-full px-1 md:px-4 py-2 rounded-lg relative">
                    {!isUser && (
                        <img
                            src={isUser ? '/asdasd/adad.png' : '/img/favicon.png'}
                            alt="profile"
                            className="max-w-[28px] object-cover rounded-full mr-4"
                        />
                    )}
                    <div className="font-bold mb-1 capitalize">
                        {sender} <span className="text-xs text-gray-400 ml-2">{time}</span>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    )
}

export default Message
