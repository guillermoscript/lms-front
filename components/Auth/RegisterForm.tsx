import { useState } from 'react';
import { Form } from '../Forms/SmartForm';
import * as yup from 'yup';
import ErrorAlert from '../Errors/ErrorAlert';
import { useAuth } from '@/providers/Auth';'.';
import { useRouter } from 'next/router';
import { apiUrl } from '../../utils/env';
import axios from 'axios';
import { DaisyUiAlert } from '../Alert/DaisyUiAlerts';
import { LoadSpinner } from '../Loaders/DaisyUiLoaders';
import { ROUTES } from '../../utils/constants';
import { useMutation } from '@tanstack/react-query';

export const RegisterSchema = yup.object().shape({
  email: yup.string().email('Debe ingresar un email válido').required('Debe ingresar un email'),
  firstName: yup.string().required('Debe ingresar un nombre'),
  lastName: yup.string().required('Debe ingresar un apellido'),
  phone: yup.string().required('Debe ingresar un teléfono'),
  password: yup
    .string()
    .required('Debe ingresar una contraseña')
    .min(6, 'La contraseña debe tener al menos 6 caracteres')
    .max(20, 'La contraseña debe tener máximo 20 caracteres'),
});
export type FormSchemaType = yup.InferType<typeof RegisterSchema>;
const clasees = {
  container: 'form-control mb-4',
  label: 'block text-sm font-medium ',
  input: 'input input-bordered w-full',
  error: 'alert alert-error text-xs gap-2 my-4',
};

const postCreateUser = async (data: any) => {
  const res = await axios.post(`${apiUrl}/api/users`, data);
  return res.data;
}

export default function RegisterForm() {

  const { user } = useAuth();
  const { push } = useRouter();

  const mutation = useMutation({
    mutationFn: postCreateUser,
    onSuccess: () => {
      // setTimeout(() => {
        push(ROUTES.dashboard.account);
      // }, 2000);
    }
  });


  const onSubmit = (values: any) => {
    mutation.mutate(values);
  };

  if (user) { 
    push(ROUTES.dashboard.account);
    return null;
  }

  return (
    <Form schema={RegisterSchema} onSubmit={onSubmit} classes="card flex-shrink-0 w-full ">
      <Form.Input name="firstName" displayName="Nombre" type="text" clasess={clasees} />
      <Form.Input name="lastName" displayName="Apellido" type="text" clasess={clasees} />
      <Form.Input name="email" displayName="Email" type="email" clasess={clasees} />
      <Form.Input name="password" displayName="Contraseña" type="password" clasess={clasees} />
      <Form.Input name="phone" displayName="Teléfono" type="tel" clasess={clasees} />

      <div className="form-control my-6">
        <button
          disabled={mutation.isPending}
          className="btn btn-accent">
          <span>
            {mutation.isPending ? 'Registrando...' : 'Registrarse'}
          </span>
        </button>
        {mutation.isPending && (
            <div className="flex justify-center mt-4">
              <LoadSpinner size='lg'  />
            </div>
        )}
      </div>
      {mutation.isError && <DaisyUiAlert type="error" message="Ocurrió un error, pro favor contacte al administrador" />}
      {mutation.isSuccess && <DaisyUiAlert type="success" message="Usuario registrado" />}
    </Form>
  );
}
