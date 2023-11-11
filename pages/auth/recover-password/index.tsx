import React, { forwardRef, useCallback, useState } from 'react';
import { useForm } from "react-hook-form";
import { Input } from '../../../components/Input';
import { apiUrl } from '../../../utils/env';
import Layout from '../../../components/Layout/Layout';
import PageTransition from '../../../components/PageTransition';
import axios from 'axios';
import { DaisyUiAlert } from '../../../components/Alert/DaisyUiAlerts';
import { useMutation } from '@tanstack/react-query';

type FormData = {
  email: string
}

const classes = {
  error: 'text-error text-sm mt-2',
  div: 'mt-4',
  label: 'block text-sm font-bold mb-2',
  input : 'input input-bordered w-full max-w-xs',
}

const postPasswordReset = async (data: FormData) => {
  const res = await axios.post(`${apiUrl}/api/users/forgot-password`, data);
  return res.data
}

const RecoverPassword = (ref: any) => {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();
  const mutation = useMutation({
    mutationFn: postPasswordReset,
  });

  const onSubmit = async (data: FormData) => {
    mutation.mutate(data);
  }

  return (
    <PageTransition ref={ref}>
      <Layout>
        <div className='max-w-2xl mx-auto my-8'>
        <div className="hero min-h-screen bg-base-200">
          <div className="hero-content text-center">
            <div className="max-w-md">
              <h1 className='text-2xl font-bold'>Recuperar Contraseña</h1>
              <p className='mt-4'>Por favor ingrese su correo electrónico para recuperar su contraseña.</p>
              <form onSubmit={handleSubmit(onSubmit)}>
                <Input
                  name="email"
                  type='email'
                  label="Correo electrónico"
                  required
                  classes={classes}
                  register={register}
                  error={errors.email}
                />
                <button className='btn btn-primary mt-4' type="submit" disabled={mutation.isLoading || mutation.isSuccess}>
                  Enviar
                </button>
              </form>
              {mutation.isError && (
                <DaisyUiAlert type='error' message='Un error ha ocurrido' />
              )}
              {mutation.isSuccess && (
                <DaisyUiAlert type='success' message='Correo enviado' />
              )}
            </div>
          </div>
        </div>
        </div>
      </Layout>
    </PageTransition>
  )
}

export default forwardRef(RecoverPassword);