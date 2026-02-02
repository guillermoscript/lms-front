"use client";

import { useTransition } from "react";
import { updateProfile } from "@/app/dashboard/student/profile/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { IconDeviceFloppy, IconLoader2 } from "@tabler/icons-react";

interface ProfileFormProps {
    profile: any;
}

export function ProfileForm({ profile }: ProfileFormProps) {
    const [isPending, startTransition] = useTransition();

    async function handleSubmit(formData: FormData) {
        startTransition(async () => {
            try {
                await updateProfile(formData);
                toast.success("Profile updated successfully!");
            } catch (error: any) {
                toast.error(error.message || "Failed to update profile");
            }
        });
    }

    return (
        <form action={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="full_name" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Full Name
                    </Label>
                    <Input
                        id="full_name"
                        name="full_name"
                        defaultValue={profile?.full_name}
                        placeholder="Your full name"
                        className="rounded-xl border-muted/30 focus:border-primary/50"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="username" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Username
                    </Label>
                    <Input
                        id="username"
                        name="username"
                        defaultValue={profile?.username}
                        placeholder="unique_username"
                        className="rounded-xl border-muted/30 focus:border-primary/50"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="website" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    Website
                </Label>
                <Input
                    id="website"
                    name="website"
                    defaultValue={profile?.website}
                    placeholder="https://yourwebsite.com"
                    className="rounded-xl border-muted/30 focus:border-primary/50"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="bio" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    Bio
                </Label>
                <Textarea
                    id="bio"
                    name="bio"
                    defaultValue={profile?.bio}
                    placeholder="Tell us a bit about yourself..."
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
                    {isPending ? "Saving Changes..." : "Save Profile Details"}
                </Button>
            </div>
        </form>
    );
}
