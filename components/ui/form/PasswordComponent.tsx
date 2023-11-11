import { FC, useState } from "react";
import classNames from "classnames";
import Image from "next/image";
import styles from "./Password.module.css";

type PasswordProps = {
	label: string;
	name: string;
	placeholder?: string;
	register: any;
	errors: any;
	isValid: boolean;
	className?: string;
};

const PasswordComponent: FC<PasswordProps> = ({
	label,
	name,
	placeholder,
	register,
	errors,
	isValid
}) => {
	const [password, setPassword] = useState("password");

	const togglePassword = () => {
		setPassword(password === "password" ? "text" : "password");
	};

	return (
		<div className={classNames(styles["form-password"], "w-full mb-4 form-password")}>
			<label
				className="text-sm font-medium text-neutral-600 mb-4"
				htmlFor={name}
			>
				{label}
			</label>
			<div className="relative">
				<input
					className={classNames(
						"flex h-12 px-4 w-full items-center gap-2 self-stretch rounded-xl border bg-black-white-white focus:ring-primary-500 focus:border-primary-500 input input-bordered border-neutral-400 mb-2",
						isValid && "border-green-500",
						errors.password && "border-red-500"
					)}
					type={password}
					id={name}
					placeholder={placeholder}
					max={20}
					min={8}
					{...register(name)}
				/>
				<div
					className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-700 cursor-pointer"
					onClick={togglePassword}
				>
					{password === "password" ? (
						<Image
							src="/icons/Eye.svg"
							alt="Eye Icon"
							width={25}
							height={25}
						/>
					) : (
						<Image
							src="/icons/NoEye.svg"
							alt="Eye Icon"
							width={25}
							height={25}
						/>
					)}
				</div>
			</div>
			{errors[name] && (
                <span className="text-xs text-status-danger my-4">{errors[name].message}</span>
			)}
		</div>
	);
};

export default PasswordComponent
