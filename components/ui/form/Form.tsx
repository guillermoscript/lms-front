import { yupResolver } from "@hookform/resolvers/yup";
import { PropsWithChildren } from "react";
import {
	useForm,
	FormProvider,
	useFormContext,
	UseFormReset,
	UseFormSetValue,
} from "react-hook-form";
import { ObjectSchema } from "yup";

export type onSubmitProps<T extends Record<string, any>> = {
	reset: UseFormReset<T>;
	setValue: UseFormSetValue<T>;
};

type FormProps<T extends Record<string, any>, S> = {
	schema: S;
	onSubmit: (data: T, props: onSubmitProps<T>) => void;
	defaultValues?: T;
	className?: string;
} & PropsWithChildren;

export default function Form<
	T extends Record<string, any>,
	S extends ObjectSchema<any>
>({ schema, onSubmit, children, defaultValues, className }: FormProps<T, S>) {
	const methods = useForm<T>({
		defaultValues: defaultValues as any,
		resolver: yupResolver(schema),
		mode: "all",
	});
	const handleSubmit = methods.handleSubmit;
	const reset = methods.reset;
	const setValue = methods.setValue;

	return (
		<FormProvider {...methods}>
			<form
				noValidate
				onSubmit={handleSubmit((data) =>
					onSubmit(data, { reset, setValue })
				)}
				className={className}
			>
				{children}
			</form>
		</FormProvider>
	);
}

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

export function Select({ name, displayName, clasess, options }: SelectProps) {
	const {
		register,
		formState: { isSubmitting, errors, isValid },
	} = useFormContext();

	return (
		<div className={clasess.container}>
			<label className={clasess.label} htmlFor={name}>
				<span className="block">{displayName}</span>
				<select
					{...register(name)}
					disabled={isSubmitting}
					className={`${clasess.input} ${
						isValid ? "select-success" : ""
					} ${errors[name as string] ? "select-error" : ""}`}
				>
					<option value="">Seleccione una opción</option>
					{options.map((option: any) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</label>
			{errors[name as string] && (
				<p className={clasess.error}>
					{errors[name as string]?.message as string}
				</p>
			)}
		</div>
	);
}

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

export function Radio({ name, displayName, clasess, value }: RadioProps) {
	const {
		register,
		formState: { isSubmitting, errors },
	} = useFormContext();

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
			{errors[name as string] && (
				<p className={clasess.error}>
					{errors[name as string]?.message as string}
				</p>
			)}
		</div>
	);
}

type CheckBoxProps = {
	name: string;
	text: string | JSX.Element;
	clasess: {
		label: string;
		input: string;
		error: string;
		container: string;
	};
};

export function CheckBox({ name, text, clasess }: CheckBoxProps) {
	const {
		register,
		formState: { isSubmitting, errors },
	} = useFormContext();

	return (
		<div className={clasess.container}>
			<label className={clasess.label} htmlFor={name}>
				<input
					type="checkbox"
					className={clasess.input}
					{...register(name)}
					disabled={isSubmitting}
				/>
				<span className="block ml-4">{text}</span>
			</label>
			{errors[name as string] && (
				<p className={clasess.error}>
					{errors[name as string]?.message as string}
				</p>
			)}
		</div>
	);
}
