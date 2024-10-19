import Link from 'next/link'

import { Button } from '@/components/ui/button'

interface ActionButtonProps {
    status: string
    href: string
    label: string
    icon?: JSX.Element
    variant?: 'default' | 'outline' | 'secondary'
}

const ActionButton: React.FC<ActionButtonProps> = ({ status, href, label, icon, variant }) => {
    const getVariant = () => {
        switch (status) {
            case 'Completed':
                return 'secondary'
            case 'In Progress':
                return 'default'
            default:
                return 'outline'
        }
    }

    return (
        <Button variant={variant || getVariant()} asChild className="w-full">
            <Link href={href}>
                {icon && <span className="mr-2">{icon}</span>}
                {label}
            </Link>
        </Button>
    )
}

export default ActionButton
