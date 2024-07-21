
import { Fragment } from 'react'

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'

interface BreadcrumbComponentProps {
    links: Array<{ href: string, label: string }>
}

const BreadcrumbComponent: React.FC<BreadcrumbComponentProps> = ({ links }) => {
    return (
        <Breadcrumb>
            <BreadcrumbList>
                {links.map((link, index) => (
                    <Fragment key={link.href}>
                        <BreadcrumbItem>
                            <BreadcrumbLink href={link.href} className={link.label.includes('Student') || link.label.includes('Courses') ? 'text-primary-500 dark:text-primary-400' : ''}>
                                {link.label}
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        {index < links.length - 1 && <BreadcrumbSeparator />}
                    </Fragment>
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    )
}

export default BreadcrumbComponent
