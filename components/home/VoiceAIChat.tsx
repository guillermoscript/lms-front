'use client'
import Vapi from '@vapi-ai/web'
import { Loader2, Mic, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { cn } from '@/utils'

import { buttonVariants } from '../ui/button'

const vapi = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY)

export default function EnhancedVoiceAIChat() {
    const t = useScopedI18n('EnhancedVoiceAIChat')
    const [callStatus, setCallStatus] = useState('inactive')
    const [statusMessage, setStatusMessage] = useState(t('statusMessage.giveItATry'))
    const [elapsedTime, setElapsedTime] = useState(0)
    const [isListening, setIsListening] = useState(false)
    const [isSpeaking, setIsSpeaking] = useState(false)


    useEffect(() => {
        const callStartHandler = () => {
            setCallStatus(t('status.active'))
            setStatusMessage(t('statusMessage.justTalk'))
            setIsListening(true)
        }
        const callEndHandler = () => {
            setCallStatus(t('status.inactive'))
            setStatusMessage(t('statusMessage.giveItATry'))
            setIsListening(false)
            setIsSpeaking(false)
            setElapsedTime(0)
        }
        const speechStartHandler = () => {
            setIsSpeaking(true)
            setStatusMessage(t('statusMessage.aiIsSpeaking'))
        }
        const speechEndHandler = () => {
            setIsSpeaking(false)
            setStatusMessage(t('statusMessage.aiFinishedSpeaking'))
        }
        const messageHandler = (message) => {
            console.log(message)
            // You can add more UI feedback here based on the message content
        }
        const errorHandler = (e) => {
            console.error(e)
            setStatusMessage(t('statusMessage.errorOccurred'))
        }

        vapi.on('call-start', callStartHandler)
        vapi.on('call-end', callEndHandler)
        vapi.on('speech-start', speechStartHandler)
        vapi.on('speech-end', speechEndHandler)
        vapi.on('message', messageHandler)
        vapi.on('error', errorHandler)

        return () => {
            vapi.off('call-start', callStartHandler)
            vapi.off('call-end', callEndHandler)
            vapi.off('speech-start', speechStartHandler)
            vapi.off('speech-end', speechEndHandler)
            vapi.off('message', messageHandler)
            vapi.off('error', errorHandler)
        }
    }, [])

    useEffect(() => {
        let interval
        if (isListening) {
            interval = setInterval(() => {
                setElapsedTime((prevTime) => prevTime + 100)
            }, 100)
        }

        // if elapsedTime is greater than 1:20 minutes, stop the call
        if (elapsedTime > 60000) {
            stop()
        }

        return () => clearInterval(interval)
    }, [isListening])

    const start = async () => {
        setCallStatus(t('callStatus.loading'))
        setStatusMessage(t('statusMessage.oneSecond'))
        try {
            await vapi.start('2c87777e-0257-4e8b-b25d-323f236e3fbc')
        } catch (error) {
            console.error('Failed to start call:', error)
            setCallStatus(t('callStatus.inactive'))
            setStatusMessage(t('statusMessage.errorOccurred'))
        }
    }

    const stop = () => {
        setCallStatus(t('callStatus.loading'))
        setStatusMessage(t('statusMessage.stopping'))
        vapi.stop()
    }

    // if elapsedTime is greater than 1:00 minutes, stop the call and show a message to the user telling them that the trial has ended
    if (elapsedTime > 60000) {
        return (
            <div className="py-10 flex flex-col items-center justify-center p-4">
                <div className="relative mb-8 flex flex-col items-center gap-9">
                    <div
                        className={cn(
                            'w-48 h-48 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300',
                            'shadow-lg',
                            'bg-gray-700 text-gray-300'
                        )}
                    >
                        <VolumeX className="w-16 h-16 text-white" />
                    </div>
                    <div
                        className={cn(
                            'px-6 py-3 rounded-full text-lg font-semibold transition-all duration-300',
                            buttonVariants({ variant: 'outline' }),
                            'bg-gray-700 text-gray-300'
                        )}
                    >
                        {t('statusMessage.trialEnded')}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="py-10 flex flex-col items-center justify-center p-4">
            <div className="relative mb-8 flex flex-col items-center gap-9">
                <div
                    className={cn(
                        'w-48 h-48 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300',
                        'shadow-lg hover:shadow-xl',
                        callStatus === t('callStatus.active')
                            ? 'bg-primary'
                            : 'bg-secondary',
                        isSpeaking && 'animate-ping'
                    )}
                    style={{
                        animation: isSpeaking ? 'pulse 1.5s infinite' : 'none',
                    }}
                    onClick={
                        callStatus === t('callStatus.active') ? stop : start
                    }
                >
                    {callStatus === t('callStatus.loading') ? (
                        <Loader2 className="w-16 h-16 animate-spin text-white" />
                    ) : isSpeaking ? (
                        <Volume2 className="w-16 h-16 text-white" />
                    ) : (
                        <Mic className="w-16 h-16 text-white" />
                    )}
                </div>
                <div
                    className={cn(
                        'px-6 py-3 rounded-full text-lg font-semibold transition-all duration-300',
                        buttonVariants({ variant: 'outline' }),
                        isSpeaking
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-700 text-gray-300'
                    )}
                >
                    {callStatus === t('callStatus.active') &&
                    elapsedTime > 0 ? (
                            <span>
                                {(elapsedTime / 1000).toFixed(1)}s - {statusMessage}
                            </span>
                        ) : (
                            statusMessage
                        )}
                </div>
            </div>
        </div>
    )
}
