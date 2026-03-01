'use client'

import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    IconBrandLinkedin,
    IconBrandTwitter,
    IconCopy,
    IconCheck,
    IconExternalLink
} from "@tabler/icons-react"
import { toast } from "sonner"

interface SocialShareModalProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    certificate: any
}

export function SocialShareModal({ isOpen, onOpenChange, certificate }: SocialShareModalProps) {
    const [copied, setCopied] = useState(false)
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const shareUrl = `${origin}/verify/${certificate.verification_code}`

    // Construct sharing URLs
    const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just earned my certification for ${certificate.courses?.title}! Verified at: `)}&url=${encodeURIComponent(shareUrl)}`

    const handleCopy = () => {
        navigator.clipboard.writeText(shareUrl)
        setCopied(true)
        toast.success("Link copied to clipboard!")
        setTimeout(() => setCopied(false), 2000)
    }

    const logShare = async (platform: string) => {
        try {
            await fetch('/api/certificates/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    certificateId: certificate.certificate_id,
                    platform
                })
            })
        } catch (e) {
            console.error("Failed to log share", e)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Share Achievement</DialogTitle>
                    <DialogDescription>
                        Congratulations on earning your certificate! Share your success with your network.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="link" className="text-xs uppercase tracking-widest font-bold text-muted-foreground">
                            Verification Link
                        </Label>
                        <div className="flex items-center gap-2">
                            <Input
                                id="link"
                                value={shareUrl}
                                readOnly
                                className="h-10 bg-muted/50 font-mono text-xs"
                            />
                            <Button size="icon" variant="outline" onClick={handleCopy} className="shrink-0 h-10 w-10">
                                {copied ? <IconCheck className="text-emerald-500" /> : <IconCopy />}
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            variant="outline"
                            className="h-12 border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                            onClick={() => {
                                window.open(linkedinUrl, '_blank')
                                logShare('linkedin')
                            }}
                        >
                            <IconBrandLinkedin className="mr-2 h-5 w-5" />
                            LinkedIn
                        </Button>
                        <Button
                            variant="outline"
                            className="h-12 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                            onClick={() => {
                                window.open(twitterUrl, '_blank')
                                logShare('twitter')
                            }}
                        >
                            <IconBrandTwitter className="mr-2 h-5 w-5" />
                            Twitter
                        </Button>
                    </div>
                </div>

                <div className="bg-muted/30 p-4 rounded-xl flex items-center gap-4">
                    <div className="h-12 w-12 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <IconExternalLink />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-bold leading-none">Public Verification</p>
                        <p className="text-xs text-muted-foreground">Anyone with this link can verify your certificate's authenticity.</p>
                    </div>
                </div>

                <DialogFooter className="sm:justify-start">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
