"use client";

import { useState, useTransition, type FormEvent } from "react";
import { updateProfile } from "@/app/[locale]/dashboard/student/profile/actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { IconDeviceFloppy, IconLoader2 } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { cn } from '@/lib/utils';
import type { Database } from '@/lib/database.types';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useRouter } from 'next/navigation';

interface ProfileFormProps {
    profile: Pick<Database['public']['Tables']['profiles']['Row'], 'full_name' | 'username' | 'website' | 'bio'> | null;
}

export function ProfileForm({ profile }: ProfileFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    // Constraint failures on `username` (too short, already taken) are expected
    // input errors, so they render next to the field instead of being thrown out
    // of the action as an unhandled Server Action error (LMS-FRONT-9E).
    const [usernameError, setUsernameError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
    const t = useTranslations('components.profileForm');

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (isPending) return;
        const formData = new FormData(event.currentTarget);
        // A function-valued form action resets uncontrolled inputs when it
        // resolves, including caught failures. Keep drafts until the save settles.
        setFeedback(null);
        startTransition(async () => {
            setUsernameError(null);
            try {
                const result = await updateProfile(formData);
                if (result.success) {
                    router.refresh();
                    setFeedback({ success: true, message: t('success') });
                    toast.success(t('success'));
                    return;
                }
                const message = t(`errors.${result.code}`);
                setFeedback({ success: false, message });
                if (result.field === 'username') setUsernameError(message);
                toast.error(message);
            } catch {
                // Network/deployment-skew failures only — constraint errors come
                // back as a result above.
                setFeedback({ success: false, message: t('error') });
                toast.error(t('error'));
            }
        });
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6" aria-busy={isPending}>
            <FieldGroup className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field className="gap-2">
                    <FieldLabel htmlFor="full_name" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        {t('fullName')}
                    </FieldLabel>
                    <Input
                        id="full_name"
                        name="full_name"
                        defaultValue={profile?.full_name ?? ''}
                        placeholder={t('placeholders.fullName')}
                        className="rounded-xl border-muted/30 focus:border-primary/50"
                    />
                </Field>
                <Field className="gap-2">
                    <FieldLabel htmlFor="username" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        {t('username')}
                    </FieldLabel>
                    <Input
                        id="username"
                        name="username"
                        defaultValue={profile?.username ?? ''}
                        placeholder={t('placeholders.username')}
                        minLength={3}
                        aria-invalid={usernameError ? true : undefined}
                        aria-describedby={usernameError ? 'username-error' : undefined}
                        className="rounded-xl border-muted/30 focus:border-primary/50"
                    />
                    {usernameError && (
                        <p id="username-error" role="alert" className="text-xs text-destructive">
                            {usernameError}
                        </p>
                    )}
                </Field>
            </FieldGroup>

            <Field className="gap-2">
                <FieldLabel htmlFor="website" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    {t('website')}
                </FieldLabel>
                <Input
                    id="website"
                    name="website"
                    defaultValue={profile?.website ?? ''}
                    placeholder={t('placeholders.website')}
                    className="rounded-xl border-muted/30 focus:border-primary/50"
                />
            </Field>

            <Field className="gap-2">
                <FieldLabel htmlFor="bio" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    {t('bio')}
                </FieldLabel>
                <Textarea
                    id="bio"
                    name="bio"
                    defaultValue={profile?.bio ?? ''}
                    placeholder={t('placeholders.bio')}
                    className="rounded-xl border-muted/30 focus:border-primary/50 min-h-[120px] resize-none"
                />
            </Field>

            <div className="pt-4">
                {feedback && (
                    <p role={feedback.success ? 'status' : 'alert'} className={cn('mb-3 text-sm', feedback.success ? 'text-success' : 'text-destructive')}>
                        {feedback.message}
                    </p>
                )}
                <Button
                    type="submit"
                    disabled={isPending}
                    className="w-full md:w-auto px-8 h-10 font-semibold gap-2"
                >
                    {isPending ? (
                        <IconLoader2 size={18} className="animate-spin" />
                    ) : (
                        <IconDeviceFloppy size={18} />
                    )}
                    {isPending ? t('saving') : t('save')}
                </Button>
            </div>
        </form>
    );
}
