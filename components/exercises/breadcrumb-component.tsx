"use client";

import Link from "next/link";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Fragment } from "react";

interface BreadcrumbLinkItem {
    href: string;
    label: string;
}

interface BreadcrumbComponentProps {
    links: BreadcrumbLinkItem[];
}

export default function BreadcrumbComponent({ links }: BreadcrumbComponentProps) {
    return (
        <Breadcrumb>
            <BreadcrumbList>
                {links.map((link, index) => {
                    const isLast = index === links.length - 1;

                    return (
                        <Fragment key={link.href}>
                            {/* The current crumb is `text-foreground`, not
                                `text-primary`: it is the one crumb that is NOT
                                a link, and at 12px the tenant accent measured
                                3.49:1 in dark. */}
                            <BreadcrumbItem>
                                {isLast ? (
                                    <BreadcrumbPage className="font-semibold text-foreground">
                                        {link.label}
                                    </BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink
                                        render={<Link href={link.href}>{link.label}</Link>}
                                    />
                                )}
                            </BreadcrumbItem>
                            {!isLast && <BreadcrumbSeparator />}
                        </Fragment>
                    );
                })}
            </BreadcrumbList>
        </Breadcrumb>
    );
}
