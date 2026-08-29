"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/app/[locale]/dashboard/student/profile/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { IconDeviceFloppy, IconLoader2 } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

interface ProfileFormProps {
    profile: any;
}

export function ProfileForm({ profile }: ProfileFormProps) {
    const [isPending, startTransition] = useTransition();
    // Constraint failures on `username` (too short, already taken) are expected
    // input errors, so they render next to the field instead of being thrown out
    // of the action as an unhandled Server Action error (LMS-FRONT-9E).
    const [usernameError, setUsernameError] = useState<string | null>(null);
    const t = useTranslations('components.profileForm');

    async function handleSubmit(formData: FormData) {
        startTransition(async () => {
            setUsernameError(null);
            try {
                const result = await updateProfile(formData);
                if (result.success) {
                    toast.success(t('success'));
                    return;
                }
                const message = t(`errors.${result.code}`);
                if (result.field === 'username') setUsernameError(message);
                toast.error(message);
            } catch {
                // Network/deployment-skew failures only — constraint errors come
                // back as a result above.
                toast.error(t('error'));
            }
        });
    }

    return (
        <form action={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="full_name" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        {t('fullName')}
                    </Label>
                    <Input
                        id="full_name"
                        name="full_name"
                        defaultValue={profile?.full_name}
                        placeholder={t('placeholders.fullName')}
                        className="rounded-xl border-muted/30 focus:border-primary/50"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="username" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        {t('username')}
                    </Label>
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
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="website" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    {t('website')}
                </Label>
                <Input
                    id="website"
                    name="website"
                    defaultValue={profile?.website}
                    placeholder={t('placeholders.website')}
                    className="rounded-xl border-muted/30 focus:border-primary/50"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="bio" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    {t('bio')}
                </Label>
                <Textarea
                    id="bio"
                    name="bio"
                    defaultValue={profile?.bio}
                    placeholder={t('placeholders.bio')}
                    className="rounded-xl border-muted/30 focus:border-primary/50 min-h-[120px] resize-none"
                />
            </div>

            <div className="pt-4">
                <Button
                    type="submit"
                    disabled={isPending}
                    className="w-full md:w-auto px-8 rounded-xl h-10 font-semibold gap-2"
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
