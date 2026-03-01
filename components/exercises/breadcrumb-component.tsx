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
                            <BreadcrumbItem>
                                {isLast ? (
                                    <BreadcrumbPage className="font-semibold text-primary">
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
