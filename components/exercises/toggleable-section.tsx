"use client";

import { useState, ReactNode } from "react";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ToggleableSectionProps {
    title: ReactNode;
    children: ReactNode;
    isOpen?: boolean;
    className?: string;
}

export default function ToggleableSection({
    title,
    children,
    isOpen: initialOpen = false,
    className,
}: ToggleableSectionProps) {
    const [isOpen, setIsOpen] = useState(initialOpen);

    return (
        <div className={cn("border rounded-xl overflow-hidden bg-muted/20", className)}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
            >
                <div>{title}</div>
                {isOpen ? <IconChevronUp size={20} /> : <IconChevronDown size={20} />}
            </button>
            {isOpen && <div className="p-4 pt-0 border-t bg-background">{children}</div>}
        </div>
    );
}
