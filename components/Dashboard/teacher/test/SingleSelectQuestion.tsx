'use client'

import React from 'react'
import { Control } from 'react-hook-form'

import { Checkbox } from '@/components/ui/checkbox'
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel
} from '@/components/ui/form'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

interface Props {
    questions: Array<{ id: string, text: string }>

    control: Control
}

const SingleSelectQuestion: React.FC<Props> = ({ questions, control }) => {
    return (
        <div className="space-y-2 mt-2">
            {questions?.map((question) => (
                <FormField
                    key={question.id}
                    control={control}
                    name={question.id.split('-')[0]} // Getting only the question id
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                {question.text.split(' (')[0]}
                            </FormLabel>

                            <FormControl>
                                <RadioGroup
                                    value={field.value}
                                    onValueChange={field.onChange}
                                >
                                    <div className="flex items-center gap-2">
                                        <RadioGroupItem
                                            value={`${
                                                question.id.split('-')[0]
                                            }-true`}
                                            id={
                                                question.id.split('-')[0] +
												'-true'
                                            }
                                        />

                                        <Label
                                            htmlFor={
                                                question.id.split('-')[0] +
												'-true'
                                            }
                                        >
                      True
                                        </Label>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <RadioGroupItem
                                            value={`${
                                                question.id.split('-')[0]
                                            }-false`}
                                            id={
                                                question.id.split('-')[0] +
												'-false'
                                            }
                                        />

                                        <Label
                                            htmlFor={
                                                question.id.split('-')[0] +
												'-false'
                                            }
                                        >
                      False
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </FormControl>
                        </FormItem>
                    )}
                />
            ))}
        </div>
    )
}

export const SingleSelectQuestionRead: React.FC<Props> = ({ questions }) => (
    <div className="space-y-2 mt-2">
        {questions?.map((question) => (
            <div key={question.id} className="flex items-center gap-2">
                <Checkbox id={question.id} />
                <Label htmlFor={question.id}>{question.text}</Label>
            </div>
        ))}
    </div>
)

export default SingleSelectQuestion
