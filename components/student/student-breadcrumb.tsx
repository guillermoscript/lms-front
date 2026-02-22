import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import Link from 'next/link'
import React from 'react'

export interface StudentBreadcrumbItem {
    label: string | React.ReactNode
    href?: string
}

interface StudentBreadcrumbProps {
    items: StudentBreadcrumbItem[]
}

export function StudentBreadcrumb({ items }: StudentBreadcrumbProps) {
    return (
        <Breadcrumb className="mb-4">
            <BreadcrumbList>
                {items.map((item, index) => {
                    const isLast = index === items.length - 1

                    return (
                        <React.Fragment key={index}>
                            <BreadcrumbItem>
                                {isLast ? (
                                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink render={<Link href={item.href || '#'} />}>
                                        {item.label}
                                    </BreadcrumbLink>
                                )}
                            </BreadcrumbItem>
                            {!isLast && <BreadcrumbSeparator />}
                        </React.Fragment>
                    )
                })}
            </BreadcrumbList>
        </Breadcrumb>
    )
}
