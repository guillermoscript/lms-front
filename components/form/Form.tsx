import { cn } from '@/utils'
import { yupResolver } from '@hookform/resolvers/yup'
import { PropsWithChildren } from 'react'
import {
  useForm,
  FormProvider,
  useFormContext,
  UseFormReset,
  UseFormSetValue
} from 'react-hook-form'
import { ObjectSchema } from 'yup'

export interface onSubmitProps<T extends Record<string, any>> {
  reset: UseFormReset<T>
  setValue: UseFormSetValue<T>
}

type FormProps<T extends Record<string, any>, S> = {
  schema: S
  onSubmit?: (data: T, props: onSubmitProps<T>) => void
  action?: (data: T) => void
  defaultValues?: T
  className?: string
} & PropsWithChildren

export default function Form<
	T extends Record<string, any>,
	S extends ObjectSchema<any>
> ({
  schema,
  onSubmit,
  action,
  children,
  defaultValues,
  className
}: FormProps<T, S>) {
  const methods = useForm<T>({
    defaultValues: defaultValues as any,
    resolver: yupResolver(schema),
    mode: 'all'
  })
  const handleSubmit = methods.handleSubmit
  const reset = methods.reset
  const setValue = methods.setValue

  return (
    <FormProvider {...methods}>
      {(onSubmit != null) && (
      <form
        noValidate
        onSubmit={handleSubmit((data) =>
					  onSubmit(data, { reset, setValue })
        )}
        className={className}
      >
        {children}
      </form>
      )}
    </FormProvider>
  )
}

interface SelectProps {
  name: string
  displayName: string
  clasess: {
    label: string
    input: string
    error: string
    container: string
  }
  options: Array<{
    value: string
    label: string
  }>
}

export function Select ({ name, displayName, clasess, options }: SelectProps) {
  const {
    register,
    formState: { isSubmitting, errors, isValid }
  } = useFormContext()

  return (
    <div className={clasess.container}>
      <label className={clasess.label} htmlFor={name}>
        <span className="block">{displayName}</span>
      </label>
      <select
        {...register(name)}
        disabled={isSubmitting}
        id={name}
        className={`${clasess.input} ${
						isValid ? 'select-success' : ''
					} ${(errors[name] != null) ? 'select-error' : ''}`}
      >
        <option value="">Seleccione una opción</option>
        {options.map((option: any) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {(errors[name] != null) && (
      <p className={clasess.error}>
        {errors[name]?.message as string}
      </p>
      )}
    </div>
  )
}

interface RadioProps {
  name: string
  displayName: string
  clasess: {
    label: string
    input: string
    error: string
    container: string
  }
  value: string
}

export function Radio ({ name, displayName, clasess, value }: RadioProps) {
  const {
    register,
    formState: { isSubmitting, errors }
  } = useFormContext()

  return (
    <div className={clasess.container}>
      <label className={clasess.label} htmlFor={name}>
        <span className="block">{displayName}</span>
        <input
          type="radio"
          {...register(name)}
          disabled={isSubmitting}
          className={clasess.input}
          value={value}
        />
      </label>
      {(errors[name] != null) && (
      <p className={clasess.error}>
        {errors[name]?.message as string}
      </p>
      )}
    </div>
  )
}

interface CheckBoxProps {
  name: string
  text: string | JSX.Element
  clasess: {
    label: string
    input: string
    error: string
    container: string
  }
  options: Array<{
    value: string
    label: string
  }>
}

export function CheckBox ({ name, text, clasess, options }: CheckBoxProps) {
  const {
    register,
    formState: { isSubmitting, errors }
  } = useFormContext()

  return (
    <div className={clasess.container}>
      {options.map((option: any) => (
        <label
          key={option.value}
          className={clasess.label}
          htmlFor={name}
        >
          <span className="block">{option.label}</span>
          <input
            type="checkbox"
            {...register(name)}
            disabled={isSubmitting}
            className={clasess.input}
            value={option.value}
          />
        </label>
      ))}
      {(errors[name] != null) && (
      <p className={clasess.error}>
        {errors[name]?.message as string}
      </p>
      )}
    </div>
  )
}

interface InputProps {
  name: string
  displayName: string
  type: string
  placeholder?: string
  clasess?: {
    label?: string
    input?: string
    error?: string
    container?: string
  }
  disabled?: boolean
}

export function Input ({
  name,
  displayName,
  placeholder,
  type,
  clasess,
  disabled
}: InputProps): JSX.Element {
  const {
    register,
    formState: { isSubmitting, errors, isValid }
  } = useFormContext()

  return (
    <div className={cn(clasess?.container, 'form-control w-full gap-3')}>
      <label className={clasess?.label ?? 'label'} htmlFor={name}>
        <span className="block text-sm font-medium ">
          {displayName}
        </span>
      </label>
      <input
        type={type}
        placeholder={placeholder}
        {...register(name)}
        disabled={isSubmitting || disabled}
        className={cn(
				  clasess?.input,
				  'flex h-12 px-4 w-full items-center gap-2 self-stretch rounded-xl border bg-black-white-white focus:ring-primary-500 focus:border-primary-500',
				  isValid && 'border-green-500',
				  (errors[name] != null) && ' border-status-danger'
        )}
      />
      {(errors[name] != null) && (
      <p className={clasess?.error ?? 'pt-2 text-status-danger'}>
        {errors[name]?.message as string}
      </p>
      )}
    </div>
  )
}
