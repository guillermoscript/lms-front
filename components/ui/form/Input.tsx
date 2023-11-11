import classNames from "classnames";
import { useFormContext } from "react-hook-form";

type InputProps = {
    name: string;
    displayName: string;
    type: string;
    placeholder?: string;
    clasess?: {
        label?: string;
        input?: string;
        error?: string;
        container?: string;
    };
    disabled?: boolean;
};

function Input({ name, displayName, placeholder, type, clasess, disabled }: InputProps): JSX.Element {
    const {
        register,
        formState: { isSubmitting, errors, isValid }
    } = useFormContext();

    return (
        <div className={classNames(clasess?.container, "form-control w-full gap-3")}>
            <label className={clasess?.label ?? "label"} htmlFor={name}>
                <span className="block text-sm font-medium ">{displayName}</span>
            </label>
            <input
                type={type}
                placeholder={placeholder}
                {...register(name)}
                disabled={isSubmitting || disabled}
                className={
                    classNames(
                        clasess?.input,
                        "flex h-12 px-4 w-full items-center gap-2 self-stretch rounded-xl border bg-black-white-white focus:ring-primary-500 focus:border-primary-500",
                        isValid && "border-green-500",
                        errors[name as string] && " border-status-danger",
                    )}
            />
            {errors[name as string] && <p className={clasess?.error ?? "pt-2 text-status-danger"}>{errors[name as string]?.message as string}</p>}
        </div>
    );
}

export default Input

Input.defaultProps = {} as Partial<InputProps>
