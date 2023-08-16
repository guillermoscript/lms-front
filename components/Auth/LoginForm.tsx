import * as yup from 'yup';
import { Form } from '../Forms/SmartForm';
import { useState } from 'react';
import ErrorAlert from '../Errors/ErrorAlert';
import { useAuth } from '.';
import Link from 'next/link';
import { ROUTES } from '../../utils/constants';
import { useRouter } from 'next/router';
import googleStyle from './googleStyle.module.css';

export const LoginSchema = yup.object().shape({
  email: yup.string().email('Debe ingresar un email válido').required('Debe ingresar un email'),
  password: yup
    .string()
    .required('Debe ingresar una contraseña')
    .min(2, 'La contraseña debe tener al menos 6 caracteres')
    .max(20, 'La contraseña debe tener máximo 20 caracteres'),
});

const clasees = {
  container: 'form-control',
  label: 'block mb-2 text-sm font-medium ',
  input: 'input input-bordered w-full',
  error: 'alert alert-error text-xs gap-2 my-4',
};

export default function LoginForm() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { push } = useRouter();
  const onSubmit = async (data: any) => {
    setError(null);
    try {
      await login(data);
      push(ROUTES.dashboard.account);
    } catch (error) {
      console.log(error);
      setError('Email o contraseña incorrectos');
    }
  };

  return (
    <Form
      schema={LoginSchema}
      onSubmit={onSubmit}
      classes="card flex-shrink-0 w-full max-w-lg p-10 shadow-2xl bg-base-100 space-y-4 md:space-y-6"
    >
      <Form.Input name="email" displayName="Email" type="email" clasess={clasees} />
      <Form.Input name="password" displayName="Contraseña" type="password" clasess={clasees} />
      <div className="flex items-center justify-between">
        <Link href={ROUTES.auth.forgotPassword}>
          <a className="text-sm font-medium text-primary hover:underline dark:text-primary-500">
            Olvidaste tu contraseña?
          </a>
        </Link>
      </div>
      <button className="btn btn-accent">Login</button>
      <p className="text-sm font-light text-gray-500 dark:text-gray-400">
        No tienes una cuenta?
        <Link href={ROUTES.auth.register}>
          <a  className="font-medium text-secondary hover:underline">
            {' '}
            Registrate
          </a>
        </Link>
      </p>
      {error && <ErrorAlert errorMessage={error} setErrorMessage={setError} />}
      <a className={googleStyle['login-with-google-btn']} id="googleLink" href={`${process.env.NEXT_PUBLIC_CMS_URL}/google`} >
        Sign in with Google
      </a>
    </Form>
  );
}
