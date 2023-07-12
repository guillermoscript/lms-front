import React from 'react';
import { UseFormRegister, FieldValues } from 'react-hook-form';

type Props = {
  name: string;
  label: string;
  register: UseFormRegister<FieldValues & any>;
  required?: boolean;
  error: any;
  type?: 'text' | 'number' | 'password' | 'email';
  classes: {
    input: string;
    label: string;
    error: string;
    div: string;
  }
};

export const Input: React.FC<Props> = ({ name, label, classes, required, register, error, type = 'text' }) => {
  return (
    <div className={classes.div}>
      <label htmlFor="name" className={classes.label}>
        {label}
      </label>
      <input className={classes.input} {...{ type }} {...register(name, { required })} />
      {error && <div className={classes.error}>This field is required</div>}
    </div>
  );
};
