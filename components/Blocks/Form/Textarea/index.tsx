import React from 'react';
import { UseFormRegister, FieldValues, FieldErrorsImpl } from 'react-hook-form';
import { Error } from '../Error';
import { Width } from '../Width';

import classes from './index.module.scss';
import { TextBlock, TextareaBlock } from '~/types/payload';

type TextField = TextBlock | TextareaBlock

export const Textarea: React.FC<TextField & {
  register: UseFormRegister<FieldValues & any>;
  rows?: number;
  errors: Partial<FieldErrorsImpl<{
    [x: string]: any;
  }>>
}> = ({ name, label, width, rows = 3, register, required: requiredFromProps, errors }) => {
  return (
    <Width width={width}>
      <div className={classes.wrap}>
        <label htmlFor="name" className={classes.label}>
          {label}
        </label>
        <textarea
          rows={rows}
          className={classes.textarea}
          {...register(name, { required: requiredFromProps })}
        />
        {requiredFromProps && errors[name] && <Error />}
      </div>
    </Width>
  );
};
