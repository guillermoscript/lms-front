// @ts-nocheck
'use client'
import { yupResolver } from '@hookform/resolvers/yup'
import { useFormState } from 'react-dom'
import { FormProvider, useForm } from 'react-hook-form'
import * as yup from 'yup'

import { linkProductAction } from '@/actions/dashboard/linkProductToCourse'
import { Input } from '@/components/form/Form'

import ButtonSubmitDashbaord from '../../ButtonSubmitDashbaord'
import SelectStatus from '../../SelectStatus'
import StateMessages from '../../StateMessages'

const courseSchema = yup.object().shape({
    course_id: yup.number().optional(),
    title: yup.string().required(),
    description: yup.string().required(),
    status: yup.string().required().oneOf(['draft', 'published', 'archived']),
    price: yup.number().positive()
})

export type courseSchemaType = yup.InferType<typeof courseSchema>

interface Courses {
    id: number
    title: string
    description: string
    status: string
    date: string
}

export default function ConvertCourseToProduct ({
    rowData
}: {
    rowData: Courses
}) {
    const [state, action] = useFormState(linkProductAction, {
        status: 'idle',
        message: '',
        error: null
    })
    const methods = useForm<courseSchemaType>({
        defaultValues: {
            title: rowData.title,
            description: rowData.description,
            status: 'draft',
            course_id: rowData.id
        },
        resolver: yupResolver(courseSchema),
        mode: 'all'
    })

    return (
        <>
            <FormProvider {...methods}>
                <form
                    onSubmit={methods.handleSubmit(async (data: courseSchemaType) => {
                        await linkProductAction(data)
                    })}
                    className="flex flex-col gap-4 md:min-h-800px"
                >
                    <div className="flex items-center gap-3 ">
                        <div className="hidden">
                            <Input name="course_id" displayName="course_id" />
                        </div>

                        <Input name="title" displayName="Title*" type="text" disabled />
                        <Input
                            name="description"
                            displayName="Description"
                            type="textarea"
                            disabled
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Input name="price" displayName="Price" type="number" min={0} />
                    </div>

                    <SelectStatus control={methods.control} />

                    <ButtonSubmitDashbaord />

                    <StateMessages state={state} />
                </form>
            </FormProvider>
        </>
    )
}
