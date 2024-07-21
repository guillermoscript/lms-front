// @ts-nocheck
'use client'
import { yupResolver } from '@hookform/resolvers/yup'
import { useEffect, useState } from 'react'
import { useFormState } from 'react-dom'
import { FormProvider, useForm } from 'react-hook-form'
import * as yup from 'yup'

import { createCourseAction } from '@/actions/dashboard/courseActions'
import { Input, Select } from '@/components/form/Form'
import { Skeleton } from '@/components/ui/skeleton'
import { selectClassNames } from '@/utils/const'
import { createClient } from '@/utils/supabase/client'
import { Tables } from '@/utils/supabase/supabase'

import ButtonSubmitDashbaord from '../../ButtonSubmitDashbaord'
import SelectStatus from '../../SelectStatus'
import StateMessages from '../../StateMessages'

const courseSchema = yup.object().shape({
    title: yup.string().required(),
    description: yup.string().required(),
    status: yup.string().required().oneOf(['draft', 'published', 'archived']),
    product_id: yup.mixed().optional(),
    thumbnail: yup.string().optional(),
    tags: yup.string().optional(),
    category_id: yup.number().optional()
})

export type courseSchemaType = yup.InferType<typeof courseSchema>

export default function CreateCourse () {
    const [state, action] = useFormState(createCourseAction, {
        status: 'idle',
        message: '',
        error: null
    })
    const methods = useForm<courseSchemaType>({
        defaultValues: {
            title: '',
            description: ''
        },
        resolver: yupResolver(courseSchema),
        mode: 'all'
    })
    const [loading, setLoading] = useState(true)
    const supabase = createClient()
    const [products, setProducts] = useState([])
    const [categories, setCategories] = useState([])
    const getItems = async (table: string, callback: (data: any) => void) => {
        try {
            setLoading(true)
            const { data, error, status } = await supabase.from(table).select('*')

            if (error != null && status !== 406) {
                console.log(error)
                throw error
            }

            if (data != null) {
                callback(data)
            }
        } catch (error) {
            console.log(error)
            alert('Error loading user data!')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        getItems('products', setProducts)
        getItems('course_categories', setCategories)
    }, [])

    return (
        <>
            <h1 className="text-2xl font-semibold">Create a new course</h1>
            <FormProvider {...methods}>
                <form action={action} className="flex flex-col gap-4 md:min-h-800px">
                    <div className="flex items-center gap-3 ">
                        <Input name="title" displayName="Title*" type="text" />
                        <Input
                            name="description"
                            displayName="Description"
                            type="textarea"
                        />
                    </div>
                    <div className="flex items-center gap-3 ">
                        <Input name="thumbnail" displayName="Thumbnail" type="text" />
                        <Input name="tags" displayName="Tags" type="text" />
                    </div>

                    {loading ? (
                        <>
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </>
                    ) : (
                        <>
                            <Select
                                clasess={selectClassNames}
                                options={categories.map(
                                    (category: Tables<'course_categories'>) => ({
                                        value: category.id.toString(),
                                        label: category.name
                                    })
                                )}
                                name="category_id"
                                displayName="Category ID"
                            />
                            <Select
                                clasess={selectClassNames}
                                options={products.map((product: Tables<'products'>) => ({
                                    value: product.product_id.toString(),
                                    label: product.name
                                }))}
                                name="product_id"
                                displayName="Product ID"
                            />
                        </>
                    )}
                    <SelectStatus control={methods.control} />

                    <ButtonSubmitDashbaord />

                    <StateMessages state={state} />
                </form>
            </FormProvider>
        </>
    )
}
