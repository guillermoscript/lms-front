import React from 'react';
import { UseFormRegister, FieldValues, FieldErrorsImpl } from 'react-hook-form';
import { Error } from '../Error';
import { Width } from '../Width';
import { FromBlockFieldType } from '../../types';

export const Text: React.FC<FromBlockFieldType & {
  register: UseFormRegister<FieldValues & any>;
  errors: Partial<FieldErrorsImpl<{
    [x: string]: any;
  }>>
}> = ({ name, label, width, register, required: requiredFromProps, errors }) => {
  return (
    <Width width={width}>
      <div className="form-control">
        <label htmlFor="name" className="form-label">
          {label}
        </label>
        <input
          type="text"
          className="input input-bordered w-full xs:max-w-xs "
          {...register(name, { required: requiredFromProps })}
        />
        {requiredFromProps && errors[name] && <Error />}
      </div>
    </Width>
  );
};
