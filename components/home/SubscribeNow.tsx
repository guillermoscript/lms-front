import React from 'react'

import { getScopedI18n } from '@/app/locales/server'

import { buttonVariants } from '../ui/button'

const SubscribeNow: React.FC = async () => {
    const t = await getScopedI18n('SubscribeNow')

    return (
        <div className='flex flex-col gap-4'>
            <a
                className={buttonVariants({ variant: 'default' })}
                href='https://yodxlomcjzw.typeform.com/to/L0FbgHZK'
            >
                {t('title')}
            </a>
            <p className='text-center text-gray-500'>
                {t('description')}
            </p>
        </div>
    )
}

export default SubscribeNow
