'use client'

import { useState } from 'react'

const ChatWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false)
    const [message, setMessage] = useState('')
    const [messages, setMessages] = useState<string[]>([])

    const handleSendMessage = () => {
    // Dummy function to send a message
        setMessages([...messages, message])
        setMessage('')
    }

    return (
        <div className="fixed bottom-4 left-4 z-50">
            {isOpen ? (
                <div className="bg-background shadow-lg rounded-lg w-80 max-w-full flex flex-col h-96 p-4">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-lg font-semibold">Chat</h2>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-gray-500 hover:text-gray-900"
                        >
              ✕
                        </button>
                    </div>
                    <div className="flex-grow overflow-y-scroll border rounded p-2">
                        {messages.map((msg, index) => (
                            <div key={index} className="mb-2">
                                {msg}
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 flex space-x-2">
                        <input
                            type="text"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="flex-1 border rounded p-2"
                            placeholder="Type a message..."
                        />
                        <button
                            onClick={handleSendMessage}
                            className="bg-blue-500 text-white rounded p-2"
                        >
              Send
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setIsOpen(true)}
                    className="bg-blue-500 text-white rounded-full w-16 h-16 flex items-center justify-center shadow-lg"
                >
          💬
                </button>
            )}
        </div>
    )
}

export default ChatWidget
