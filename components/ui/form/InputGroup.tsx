export type InputGroupProps = {
	name: string;
	label: string;
	type: string;
	classNames: {
		container: string;
		label: string;
		input: string;
		error: string;
	};
	register: any;
	errors?: any;
    validations?: any;
};

export default function InputGroup({
	name,
	label,
	type,
	classNames,
	register,
	errors,
    validations
}: InputGroupProps) {
	return (
		<div className={classNames.container}>
			<label htmlFor={name} className={classNames.label}>
				{label}
			</label>
			<input
				type={type}
				id={name}
				className={classNames.input}
				{...register(name, validations)}
			/>
			{errors[name] && (
				<div className={classNames.error}>{errors[name].message}</div>
			)}
		</div>
	);
}
