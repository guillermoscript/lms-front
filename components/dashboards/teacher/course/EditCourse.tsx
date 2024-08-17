// @ts-nocheck
'use client'
import { yupResolver } from '@hookform/resolvers/yup'
import { useEffect, useState } from 'react'
import { useFormState } from 'react-dom'
import { FormProvider, useForm } from 'react-hook-form'
import * as yup from 'yup'

import { updateCourseAction } from '@/actions/dashboard/courseActions'
import { Input, Select } from '@/components/form/Form'
import { Skeleton } from '@/components/ui/skeleton'
import { selectClassNames } from '@/utils/const'
import { createClient } from '@/utils/supabase/client'
import { Tables } from '@/utils/supabase/supabase'

import ButtonSubmitDashbaord from '../../ButtonSubmitDashbaord'
import StateMessages from '../../StateMessages'

const courseSchema = yup.object().shape({
    title: yup.string().required(),
    description: yup.string().required(),
    status: yup.string().required().oneOf(['draft', 'published', 'archived']),
    product_id: yup.mixed().optional(),
    thumbnail_url: yup.string().optional(),
    tags: yup.string().optional(),
    category_id: yup.number().optional()
})

export type courseSchemaType = yup.InferType<typeof courseSchema>

export default function EditCourse({
    courseData
}: {
    courseData: Tables<'courses'>
}) {
    const {
        course_id: courseId,
        title,
        description,
        status,
        product_id,
        category_id,
        thumbnail_url,
        tags
    } = courseData

    console.log(status)

    const [state, action] = useFormState(updateCourseAction, {
        status: 'idle',
        message: '',
        error: null
    })
    const methods = useForm<courseSchemaType>({
        defaultValues: {
            title,
            description,
            status,
            product_id,
            category_id,
            thumbnail_url,
            tags,
            course_id: courseId
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
            alert('Error loading data!')
        } finally {
            setLoading(false)
        }
    }

    const getCourse = async (courseId: string) => {
        try {
            setLoading(true)
            const { data, error, status } = await supabase
                .from('courses')
                .select('*')
                .eq('course_id', courseId)
                .single()

            if (error != null && status !== 406) {
                console.log(error)
                throw error
            }

            if (data != null) {
                methods.reset(data)
            }
        } catch (error) {
            console.log(error)
            alert('Error loading course data!')
        } finally {
            setLoading(false)
        }
    }

    console.log(courseId)

    useEffect(() => {
        getItems('products', setProducts)
        getItems('course_categories', setCategories)
        getCourse(courseId)
    }, [courseId])

    return (
        <>
            <h1 className="text-2xl font-semibold">Edit Course</h1>
            <FormProvider {...methods}>
                <form
                    action={action}
                    className="flex flex-col gap-4 md:min-h-800px"
                >
                    <div className="flex items-center gap-3 ">
                        <Input name="title" displayName="Title*" type="text" />
                        <Input
                            name="description"
                            displayName="Description"
                            type="textarea"
                        />
                    </div>
                    <div className="flex items-center gap-3 ">
                        <Input
                            name="thumbnail_url"
                            displayName="thumbnail_url"
                            type="text"
                        />
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
                                    (
                                        category: Tables<'course_categories'>
                                    ) => ({
                                        value: category.id.toString(),
                                        label: category.name,
                                    })
                                )}
                                name="category_id"
                                displayName="Category ID"
                            />
                            <Select
                                clasess={selectClassNames}
                                options={products.map(
                                    (product: Tables<'products'>) => ({
                                        value: product.product_id.toString(),
                                        label: product.name,
                                    })
                                )}
                                name="product_id"
                                displayName="Product ID"
                            />
                        </>
                    )}
                    <Select
                        clasess={selectClassNames}
                        options={[
                            { value: 'draft', label: 'Draft' },
                            { value: 'published', label: 'Published' },
                            { value: 'archived', label: 'Archived' },
                        ]}
                        name="status"
                        displayName="Status"
                    />

                    <Input name="course_id" type="hidden" />

                    <ButtonSubmitDashbaord />

                    <StateMessages state={state} />
                </form>
            </FormProvider>
        </>
    )
}
