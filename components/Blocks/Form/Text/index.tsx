import React from 'react';
import { UseFormRegister, FieldValues, FieldErrorsImpl } from 'react-hook-form';
import { Error } from '../Error';
import { Width } from '../Width';

import classes from './index.module.scss';
import { TextBlock } from '~/types/payload';

type TextField = TextBlock

export const Text: React.FC<TextField & {
  register: UseFormRegister<FieldValues & any>;
  errors: Partial<FieldErrorsImpl<{
    [x: string]: any;
  }>>
}> = ({ name, label, width, register, required: requiredFromProps, errors }) => {
  return (
    <Width width={width}>
      <div className={classes.wrap}>
        <label htmlFor="name" className={classes.label}>
          {label}
        </label>
        <input
          type="text"
          className={classes.input}
          {...register(name, { required: requiredFromProps })}
        />
        {requiredFromProps && errors[name] && <Error />}
      </div>
    </Width>
  );
};
