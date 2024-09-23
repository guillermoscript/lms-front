import { Control } from 'react-hook-form'

import { useScopedI18n } from '@/app/locales/client'
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

import { courseSchemaType } from './teacher/course/CreateCourse'

export default function SelectStatus({
    control,
}: {
    control: Control<courseSchemaType>
}) {
    const t = useScopedI18n('SelectStatus')
    return (
        <FormField
            control={control}
            name="status"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>{t('status')}</FormLabel>
                    <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                    >
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder={t('placeholder')} />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="draft">{t('draft')}</SelectItem>
                            <SelectItem value="published">
                                {t('published')}
                            </SelectItem>
                            <SelectItem value="archived">
                                {t('archived')}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    <FormDescription></FormDescription>
                    <FormMessage />
                </FormItem>
            )}
        />
    )
}
