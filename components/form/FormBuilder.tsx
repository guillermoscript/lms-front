// @ts-nocheck
'use client'
import { useEffect, useState } from 'react'
import {
    useFieldArray,
    useFormContext
} from 'react-hook-form'

import { Separator } from '../ui/separator'
import InputField from './InputField'

interface FormBuilderProps {
    initialFields?: any[]
    children?: React.ReactNode
}

const FormBuilder: React.FC<FormBuilderProps> = ({ initialFields, children }) => {
    const {
        register,
        control,
        handleSubmit,
        reset,
        formState: { errors }
    } = useFormContext<IFormInput>()
    const { fields, append, remove } = useFieldArray({
        control,
        name: 'formFields'
    })
    const [inputType, setInputType] = useState<string>('free_text')

    useEffect(() => {
        if (initialFields?.length > 0) {
            // Resets the form with the initial fields
            reset({ formFields: initialFields })
        }
    }, [initialFields, reset])

    const addField = () => {
        append({ type: inputType, label: '', options: [], required: false })
    }

    const onSubmit: SubmitHandler<IFormInput> = (data) => {
        console.log(data)
    }

    console.log(fields)

    return (
        <div onSubmit={handleSubmit(onSubmit)} className="space-y-4 flex flex-col gap-4">
            {fields.map((field, index) => (
                <InputField
                    key={field.id}
                    field={field}
                    index={index}
                    register={register}
                    control={control}
                    remove={remove}
                />
            ))}

            <Separator />

            <select
                value={inputType}
                onChange={(e) => setInputType(e.target.value)}
                className="block w-full p-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
                <option value="free_text">Fill In</option>
                <option value="multiple_choice">Multiple Choices</option>
                <option value="true_false">True/False</option>
            </select>

            <Separator />

            <button
                type="button"
                onClick={addField}
                className="px-4 py-2 bg-blue-500 text-white rounded-md"
            >
        Add Field
            </button>

            {children}

        </div>
    )
}

export default FormBuilder
