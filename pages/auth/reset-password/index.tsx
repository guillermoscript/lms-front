import React, { forwardRef, useCallback, useEffect, useState } from 'react';
import { useForm } from "react-hook-form";
import { Input } from '../../../components/Input';
import { useRouter } from 'next/router';
import { useAuth } from '../../../components/Auth';
import { apiUrl } from '../../../utils/env';
import Layout from '../../../components/Layout/Layout';
import PageTransition from '../../../components/PageTransition';
import { IndexPageRef } from '../../../utils/types/common';


const classes = {
  error: 'text-error text-sm mt-2',
  div: 'mt-4',
  input : 'input input-bordered w-full max-w-xs',
  label: 'block text-sm font-bold mb-2',
}

type FormData = {
  password: string
  token: string
}

const ResetPassword = (ref: IndexPageRef) => {
  const [error, setError] = useState('');
  const { login } = useAuth();
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : undefined;

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>();

  const onSubmit = useCallback(async (data: FormData) => {
    const response = await fetch(`${apiUrl}/api/users/reset-password`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (response.ok) {
      const json = await response.json();

      // Automatically log the user in after they successfully reset password
      await login({ email: json.user.email, password: data.password })

      // Redirect them to /account with success message in URL
      router.push('/dashboard/account?success=Password reset successfully.');
    } else {
      setError('There was a problem while resetting your password. Please try again later.');
    }
  }, [router, login]);

  // when NextJS populates token within router,
  // reset form with new token value
  useEffect(() => {
    reset({ token })
  }, [reset, token]);

  return (
    <PageTransition ref={ref}>
      <Layout>
        <div className="hero min-h-screen bg-base-200">
          <div className="hero-content text-center">
            <div className="max-w-md">
              <h1 className='text-2xl font-bold'>Cambiar Contraseña</h1>
              <p className='mt-4'>Por favor ingrese su nueva contraseña.</p>
              {error && <div className={classes.error}>{error}</div>}
              <form onSubmit={handleSubmit(onSubmit)}>
                <Input
                  name="password"
                  type="password"
                  label="Contraseña"
                  required
                  classes={classes}
                  register={register}
                  error={errors.password}
                />
                <input type="hidden" {...register('token')} />
                <button 
                  className='btn btn-primary mt-4'
                type="submit">Cambiar Contraseña</button>
              </form>
            </div>
          </div>
        </div>
      </Layout>
    </PageTransition>
  );
}

export default forwardRef(ResetPassword);