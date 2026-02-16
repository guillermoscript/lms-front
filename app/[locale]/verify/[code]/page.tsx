import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    IconShieldCheck,
    IconShieldX,
    IconCertificate,
    IconDownload,
    IconSignature,
    IconCalendar,
    IconBuilding
} from '@tabler/icons-react'
import Link from 'next/link'

interface PageProps {
    params: Promise<{ code: string }>
}

export default async function VerificationPage({ params }: PageProps) {
    const { code } = await params
    const supabase = await createClient()
    const t = await getTranslations('common') // or a specific verification namespace if created

    const { data: certificate, error } = await supabase
        .from('certificates')
        .select(`
      *,
      profiles(full_name, avatar_url),
      courses(title, slug),
      certificate_templates(*)
    `)
        .eq('verification_code', code)
        .single()

    if (error || !certificate) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
                <Card className="max-w-md w-full text-center">
                    <CardHeader>
                        <div className="mx-auto bg-destructive/10 text-destructive p-3 rounded-full w-fit mb-4">
                            <IconShieldX size={48} />
                        </div>
                        <CardTitle className="text-2xl font-bold">Invalid Certificate</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-muted-foreground">
                            The verification code provided does not match any certificate in our records or the certificate has been revoked.
                        </p>
                        <Link href="/" className="w-full">
                            <Button className="w-full">Return to Home</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        )
    }

    const isRevoked = !!certificate.revoked_at
    const primaryColor = certificate.certificate_templates?.design_settings?.primary_color || '#3B82F6'

    return (
        <div className="min-h-screen bg-muted/30 py-12 px-4">
            <div className="max-w-3xl mx-auto space-y-8">
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-black tracking-tight flex items-center justify-center gap-2">
                        <IconShieldCheck className="text-emerald-500" size={32} />
                        CONFIANCE CERTIFIED
                    </h1>
                    <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">
                        Official Verification Portal
                    </p>
                </div>

                <Card className="overflow-hidden border-none shadow-2xl relative">
                    {/* Decorative Top Border */}
                    <div className="h-2 w-full" style={{ backgroundColor: primaryColor }} />

                    <CardHeader className="bg-card text-center pb-2">
                        <div className="mx-auto mb-4 bg-primary/10 text-primary p-4 rounded-full w-fit">
                            <IconCertificate size={64} />
                        </div>
                        <Badge variant="outline" className="mb-2 uppercase tracking-widest bg-emerald-50 text-emerald-700 border-emerald-200">
                            Verified Authenticity
                        </Badge>
                        <CardTitle className="text-3xl font-black">{certificate.certificate_templates?.template_name || certificate.courses?.title}</CardTitle>
                    </CardHeader>

                    <CardContent className="p-8 space-y-12">
                        {/* Student Info */}
                        <div className="space-y-4 text-center">
                            <div className="flex flex-col items-center">
                                <span className="text-sm text-muted-foreground uppercase tracking-wider font-bold">This is to certify that</span>
                                <h2 className="text-4xl font-black mt-2 text-primary">{certificate.profiles?.full_name}</h2>
                                <div className="h-1 w-24 bg-primary/20 mt-4 rounded-full" />
                            </div>
                            <p className="text-lg text-muted-foreground px-8 leading-relaxed">
                                has successfully completed the requirements for the course
                                <br />
                                <span className="font-bold text-foreground">"{certificate.courses?.title}"</span>
                            </p>
                        </div>

                        {/* Verification Details Grid */}
                        <div className="grid gap-6 sm:grid-cols-2 pt-8 border-t">
                            <div className="flex items-start gap-4">
                                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                                    <IconBuilding size={20} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest mb-1">Issuer</p>
                                    <p className="font-semibold">{certificate.certificate_templates?.issuer_name || 'LMS Academy'}</p>
                                    {certificate.certificate_templates?.issuer_url && (
                                        <a href={certificate.certificate_templates.issuer_url} className="text-xs text-primary hover:underline">
                                            {new URL(certificate.certificate_templates.issuer_url).hostname}
                                        </a>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                                    <IconCalendar size={20} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest mb-1">Issue Date</p>
                                    <p className="font-semibold">{new Date(certificate.issued_at).toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                                    <IconSignature size={20} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest mb-1">Verification Code</p>
                                    <p className="font-mono text-sm uppercase tracking-tighter">{certificate.verification_code}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                                    <IconShieldCheck size={20} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest mb-1">Status</p>
                                    <Badge className={isRevoked ? "bg-destructive" : "bg-emerald-500 hover:bg-emerald-600"}>
                                        {isRevoked ? 'Revoked' : 'Active & Valid'}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <a href={certificate.pdf_url || `/api/certificates/${certificate.certificate_id}`} target="_blank" rel="noopener noreferrer" className="flex-1">
                                <Button className="w-full h-12 text-lg font-bold" style={{ backgroundColor: primaryColor }}>
                                    <IconDownload className="mr-2" />
                                    {certificate.pdf_url ? 'Download Official PDF' : 'View Certificate'}
                                </Button>
                            </a>
                            <Link href={`/courses/${certificate.courses?.slug}`} className="flex-1">
                                <Button variant="outline" className="w-full h-12 text-lg font-bold">
                                    <IconCertificate className="mr-2" />
                                    View Course Details
                                </Button>
                            </Link>
                        </div>
                    </CardContent>

                    {/* Verification Badge/Seal */}
                    <div className="absolute top-4 right-4 opacity-10 pointer-events-none">
                        <IconShieldCheck size={120} />
                    </div>
                </Card>

                <footer className="text-center text-xs text-muted-foreground space-y-1">
                    <p>© {new Date().getFullYear()} LMS Platform. All cryptographic signatures verified.</p>
                    <p>Confiance Protocol v1.0 • Secured by Supabase Auth</p>
                </footer>
            </div>
        </div>
    )
}
