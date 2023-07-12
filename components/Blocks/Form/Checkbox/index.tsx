import React, { useState } from 'react';
import { UseFormRegister, FieldErrorsImpl, FieldValues } from 'react-hook-form';
import { Error } from '../Error';
import { Width } from '../Width';
import { FromBlockFieldType } from '../../types';


export const Checkbox: React.FC<FromBlockFieldType & {
  register: UseFormRegister<FieldValues & any>,
  setValue: any,
  getValues: any,
  errors: Partial<FieldErrorsImpl<{
    [x: string]: any;
  }>>
}> = ({ name, label, width, register, setValue, getValues, required: requiredFromProps, errors }) => {
  const [checked, setChecked] = useState(false);

  const isCheckboxChecked = getValues(name);

  return (
    <Width width={width}>
      <div
        className="form-control"
      >
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            {...register(name, { required: requiredFromProps })}
            checked={isCheckboxChecked}
            className='checkbox'
          />
          <button
            type="button"
            className='btn btn-secondary'
            onClick={() => {
              setValue(name, !checked)
              setChecked(!checked)
            }}
          >
            <span className="form-checkbox">
              {checked ? (
                "checked"
              ) : (
                "unchecked"
              )}
            </span>
          </button>
          <span className="form-label">{label}</span>
        </div>
        {requiredFromProps && errors[name] && checked === false && <Error />}
      </div>
    </Width>
  );
};
