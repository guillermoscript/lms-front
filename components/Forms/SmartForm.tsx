import { yupResolver } from "@hookform/resolvers/yup";
import { useForm, FormProvider, useFormContext } from 'react-hook-form';

type FormProps = {
  schema: any;
  onSubmit: (data: Record<string, any>, event?: React.BaseSyntheticEvent) => void;
  children: React.ReactNode;
  defaultValues?: Record<string, any>;
  classes: string;
};

export function Form({ schema, onSubmit, children, defaultValues, classes }: FormProps) {
  const methods = useForm({
    defaultValues,
    resolver: yupResolver(schema),
    mode: 'all',
  });
  const handleSubmit = methods.handleSubmit;

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className={classes}>
        {children}
      </form>
    </FormProvider>
  );
}

type InputProps = {
  name: string;
  displayName: string;
  type: string;
  clasess: {
    label: string;
    input: string;
    error: string;
    container: string;
  };
  disabled?: boolean;
  placeholder?: string;
};

Form.Input = function Input({ name, displayName, type, clasess, disabled, placeholder }: InputProps) {
  const {
    register,
    formState: { isSubmitting, errors, isValid }
  } = useFormContext();

  return (
    <div className={clasess.container}>
      <label className={clasess.label} htmlFor={name}>
        <span className="block mb-2">{displayName}</span>
      </label>
      <input placeholder={placeholder} type={type} {...register(name)} disabled={isSubmitting || disabled} className={`${clasess.input} ${isValid ? 'input-success' : ''} ${errors[name as string] ? 'input-error' : ''}`} />
      {errors[name as string] && <p className={clasess.error}>{errors[name as string]?.message as string}</p>}
    </div>
  );
};

type SelectProps = {
  name: string;
  displayName: string;
  clasess: {
    label: string;
    input: string;
    error: string;
    container: string;
  };
  options: {
    value: string;
    label: string;
  }[];
};

Form.Select = function Select({ name, displayName, clasess, options }: SelectProps) {
  const {
    register,
    formState: { isSubmitting, errors, isValid },
  } = useFormContext();

  return (
    <div className={clasess.container}>
      <label className={clasess.label} htmlFor={name}>
        <span className="block">{displayName}</span>
      </label>
      <select {...register(name)} disabled={isSubmitting} className={`${clasess.input} ${isValid ? 'select-success' : ''} ${errors[name as string] ? 'select-error' : ''}`} >
        <option value="" >Seleccione una opción</option>
        {options.map((option: any) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {errors[name as string] && <p className={clasess.error}>{errors[name as string]?.message as string}</p>}
    </div>
  );
};

type RadioProps = {
  name: string;
  displayName: string;
  clasess: {
    label: string;
    input: string;
    error: string;
    container: string;
  };
  value: string;
};

Form.Radio = function Radio({ name, displayName, clasess, value }: RadioProps) {
  const {
    register,
    formState: { isSubmitting, errors },
  } = useFormContext();

  return (
    <div className={clasess.container}>
      <label className={clasess.label} htmlFor={name}>
        <span className="block">{displayName}</span>
      </label>
      <input type="radio" {...register(name)} disabled={isSubmitting} className={clasess.input} value={value} />
      {errors[name as string] && <p className={clasess.error}>{errors[name as string]?.message as string}</p>}
    </div>
  );
};

type CheckBoxProps = {
  name: string;
  text: string;
  clasess: {
    label: string;
    input: string;
    error: string;
    container: string;
  };
};

Form.CheckBox = function CheckBox({ name, text, clasess }: CheckBoxProps) {
  const {
    register,
    formState: { isSubmitting, errors },
  } = useFormContext();

  return (
    <div className={clasess.container}>
      <label className={clasess.label} htmlFor={name}>
        <span className="block ml-4">{text}</span>
      </label>
      <input type="checkbox" className={clasess.input} {...register(name)} disabled={isSubmitting} />
      {errors[name as string] && <p className={clasess.error}>{errors[name as string]?.message as string}</p>}
    </div>
  );
};
