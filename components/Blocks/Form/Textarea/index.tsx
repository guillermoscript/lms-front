import React from 'react';
import { UseFormRegister, FieldValues, FieldErrorsImpl } from 'react-hook-form';
import { Error } from '../Error';
import { Width } from '../Width';
import { FromBlockFieldType } from '../../types';

export const Textarea: React.FC<FromBlockFieldType & {
  register: UseFormRegister<FieldValues & any>;
  rows?: number;
  errors: Partial<FieldErrorsImpl<{
    [x: string]: any;
  }>>
}> = ({ name, label, width, rows = 3, register, required: requiredFromProps, errors }) => {
  return (
    <Width width={width}>
      <div className="form-control">
        <label htmlFor="name" className="form-label">
          {label}
        </label>
        <textarea
          rows={rows}
          className="textarea textarea-bordered"
          {...register(name, { required: requiredFromProps })}
        />
        {requiredFromProps && errors[name] && <Error />}
      </div>
    </Width>
  );
};
