import React, { useState, useCallback } from 'react'
import { fields } from './fields'
// import { Form as FormType } from 'payload-plugin-form-builder/dist/types'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/router'
import { RichText } from '../../RichText'
import { useAuth } from '../../Auth'
import { Examn } from '../../../payload-types'

// import classes from './index.module.scss'

export type Value = unknown

export interface Property {
  [key: string]: Value
}

export interface Data {
  [key: string]: Value | Property | Property[]
}

export type FormBlockType = {
  blockName?: string
  blockType?: 'formBlock'
  enableIntro: boolean
  form: Examn
  callback: (data: Data, {
    onSuccess,
    onError,
  }: {
    onSuccess: (data:any) => void
    onError: (data:any) => void
  }) => void
  introContent?: {
    [k: string]: unknown
  }[]
}

export const FormBlock: React.FC<
  FormBlockType & {
    id?: string
  }
> = props => {
  const {
    enableIntro,
    introContent,
    callback,
    form: formFromProps,
    form: { id: formID, submitButtonLabel, confirmationType, redirect, confirmationMessage } = {},
  } = props

  const formMethods = useForm({
    // defaultValues: buildInitialFormState(formFromProps.fields),
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue,
    getValues,
  } = formMethods

  const [isLoading, setIsLoading] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState<boolean>()
  const [error, setError] = useState<{ status?: string; message: string } | undefined>()
  const router = useRouter()
  const { user } = useAuth()

  const onSubmit = useCallback(
    (data: Data) => {
      let loadingTimerID: NodeJS.Timer

      const submitForm = async () => {
        setError(undefined)

        const dataToSend = Object.entries(data).map(([name, value]) => ({
          field: name,
          value,
        }))

        // delay loading indicator by 1s
        loadingTimerID = setTimeout(() => {
          setIsLoading(true)
        }, 1000)

        callback({
          formID: formID,
          submissionData: dataToSend,
        },{
          onSuccess: (data) => {
            setIsLoading(false)
            setHasSubmitted(true)
            if (confirmationType === 'redirect' && redirect) {
              const { url } = redirect
  
              const redirectUrl = url
  
              if (redirectUrl) router.push(redirectUrl)
            }
  
            if (confirmationType === 'message' && confirmationMessage) {
              setValue('confirmationMessage', confirmationMessage)
            }  
          },
          onError: (err) => {
            console.warn(err)
            setIsLoading(false)
            setError({
              message: 'Something went wrong.',
            })
          }
        })
      }

      submitForm()
    },
    [router, formID, redirect, confirmationType],
  )

  return (
      <div
        className="form-block"
      >
        {enableIntro && introContent && !hasSubmitted && (
          <RichText content={introContent} />
        )}
        {!isLoading && hasSubmitted && confirmationType === 'message' && (
          <RichText content={confirmationMessage as any} />
        )}
        {isLoading && !hasSubmitted && <p>Loading, please wait...</p>}
        {error && <div>{`${error.status || '500'}: ${error.message || ''}`}</div>}
        {!hasSubmitted && (
          <form id={formID} onSubmit={handleSubmit(onSubmit)}>
            <div className="form-block__fields">
              {formFromProps &&
                formFromProps.fields &&
                formFromProps.fields.map((field, index) => {

                  // Not my code, but I think this is the problem
                  // @ts-ignore
                  const Field = fields?.[field.blockType]
                  if (Field) {
                    return (
                      <React.Fragment key={index}>
                        <Field
                          form={formFromProps}
                          {...field}
                          {...formMethods}
                          register={register}
                          errors={errors}
                          control={control}
                        />
                      </React.Fragment>
                    )
                  }
                  return null
                })}
            </div>
            <button
              className='btn btn-primary'
              type="submit">{submitButtonLabel}</button>
          </form>
        )}
      </div>
  )
}
