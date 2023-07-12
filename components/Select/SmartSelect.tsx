type SelectProps = {
  register: any;
  options: string[];
  name: string;
};

export default function SmartSelect({ register, options, name, ...rest }: SelectProps) {
  return (
    <select {...register(name)} {...rest}>
      {options.map((value) => (
        <option key={value} value={value}>
          {value}
        </option>
      ))}
    </select>
  );
}
