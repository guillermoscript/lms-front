"use client";

import { useTransition } from "react";
import { updateProfile } from "@/app/dashboard/student/profile/actions";
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
    const t = useTranslations('components.profileForm');

    async function handleSubmit(formData: FormData) {
        startTransition(async () => {
            try {
                await updateProfile(formData);
                toast.success(t('success'));
            } catch (error: any) {
                toast.error(error.message || t('error'));
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
                        defaultValue={profile?.username}
                        placeholder={t('placeholders.username')}
                        className="rounded-xl border-muted/30 focus:border-primary/50"
                    />
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
                    className="w-full md:w-auto px-8 rounded-2xl h-12 font-black gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
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
