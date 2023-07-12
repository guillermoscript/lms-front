import { SubmitHandler, useForm, useFormContext } from 'react-hook-form';
import { venezuelanBanks } from '../../utils/venezuelaBanks';
import { InputGroupProps } from '../Inputs/InputGroup';
import { useEffect } from 'react';
import { Product, User } from '../../payload-types';
import  { Form } from '../Forms/SmartForm';
import * as yup from "yup";
import CheckoutFormGuestView from './CheckoutFormGuestView';
import CheckoutFormUserView from './CheckoutFormUserView';

export const classNames = {
  container: 'col-span-6 sm:col-span-3',
  label: 'block text-xs mb-3',
  input: 'input input-bordered w-full max-w-xs',
  error: "alert alert-error text-xs gap-2 my-4",
};

export const formInputDataNewUser = [
  {
    name: 'firstName',
    label: 'Nombre',
    type: 'text',
    classNames,
  },
  {
    name: 'lastName',
    label: 'Apellido',
    type: 'text',
    classNames,
  },
  {
    name: 'email',
    label: 'Email',
    type: 'email',
    classNames,
  },
  {
    name: 'phone',
    label: 'Teléfono',
    type: 'tel',
    classNames,
  },
  {
    name: 'password',
    label: 'Contraseña',
    type: 'password',
    classNames: {
      ...classNames,
      container: 'col-span-6 w-full',
      input: 'input input-bordered w-full',
    }
  }
] as InputGroupProps[];

export const formInputPaymentDataZelle = [
  {
    name: 'zelleEmail',
    label: 'Email',
    type: 'email',
    classNames,
  },
  {
    name: 'zelleName',
    label: 'Nombre',
    type: 'text',
    classNames,
  },
] as InputGroupProps[];

export const formInputPaymentDataPagoMovil = [
  {
    name: 'pagoMovilPhone',
    label: 'Teléfono',
    type: 'tel',
    classNames,
  },
  {
    name: 'pagoMovilName',
    label: 'Nombre',
    type: 'text',
    classNames,
  },
  {
    name: 'pagoMovilIdn',
    label: 'Cédula',
    type: 'number',
    classNames,
  }
] as InputGroupProps[];

export const FormSchema = yup.object().shape({
  paymentMethod: yup.string().required('Debe seleccionar un método de pago'),
  referenceNumber: yup.string().required('Debe ingresar un número de referencia'),
})

export const zelleEmail =  yup.string().email('Debe ingresar un email válido').when('paymentMethod', {
  is: 'zelle',
  then(schema) {
    return schema.required('Debe ingresar un email');
  },
})
export const zelleName = yup.string().when('paymentMethod', {
  is: 'zelle',
  then(schema) {
    return schema.required('Debe ingresar un nombre');
  }
})
export const pagoMovilPhone = yup.string().when('paymentMethod', {
  is: 'pagoMovil',
  then(schema) {
    return schema.required('Debe ingresar un teléfono');
  }
})
export const pagoMovilName = yup.string().when('paymentMethod', {
  is: 'pagoMovil',
  then(schema) {
    return schema.required('Debe ingresar un nombre');
  }
})
export const pagoMovilIdn = yup.string().when('paymentMethod', {
  is: 'pagoMovil',
  then(schema) {
    return schema.required('Debe ingresar una cédula');
  }
})

export const zelleSchema = yup.object().shape({
  zelleEmail,
  zelleName,
})

export const pagoMovilSchema = yup.object().shape({
  pagoMovilPhone,
  pagoMovilName,
  pagoMovilIdn,
})

export const GuestSchema = yup.object().shape({
  email: yup.string().email('Debe ingresar un email válido').required('Debe ingresar un email'),
  firstName: yup.string().required('Debe ingresar un nombre'),
  lastName: yup.string().required('Debe ingresar un apellido'),
  phone: yup.string().required('Debe ingresar un teléfono'),
  password: yup.string().required('Debe ingresar una contraseña').min(6, 'La contraseña debe tener al menos 6 caracteres').max(20, 'La contraseña debe tener máximo 20 caracteres'),
  ...zelleSchema.fields,
  ...pagoMovilSchema.fields,
  ...FormSchema.fields
});


export type GuestSchemaType = yup.InferType<typeof GuestSchema>;

export type FormSchemaType = yup.InferType<typeof FormSchema>;

export type CheckoutFormProps = {
  user: User | null;
  productData: Product
};

export default function CheckoutForm({ user, productData }: CheckoutFormProps) {
  
  if (!user) {
    return (
      <CheckoutFormGuestView
        productData={productData}
      />
    )
  }

  return (
    <CheckoutFormUserView
      user={user}
      productData={productData}
    />
  )
}

export type CheckoutFormGuestViewProps =  Omit<CheckoutFormProps, 'user'>;

export function PaymentMethods() {

  const { watch, unregister } = useFormContext()
  const watchPaymentMethod = watch('paymentMethod');
  
  useEffect(() => {
    if (watchPaymentMethod === 'zelle') {
      unregister('pagoMovilPhone');
      unregister('pagoMovilName');
      unregister('pagoMovilBank');
      unregister('pagoMovilIdn');
    } else if (watchPaymentMethod === 'pagoMovil') {
      unregister('zelleEmail');
      unregister('zelleName');
    }
  }, [watchPaymentMethod]);

  return (
    <>
      <div className="w-full flex justify-around col-span-6">
        <Form.Radio name="paymentMethod" displayName="Zelle" value="zelle" clasess={classNames} />
        <Form.Radio name="paymentMethod" displayName="Pago Móvil" value="pagoMovil" clasess={classNames} />
      </div>

      {watchPaymentMethod === 'zelle' && (
        <>
          {
            formInputPaymentDataZelle.map((input, index) => (
              <Form.Input 
                key={index}
                name={input.name}
                displayName={input.label}
                type={input.type}
                clasess={{
                  container: 'col-span-6 sm:col-span-3',
                  label: 'block text-xs mb-2',
                  input: 'input input-bordered w-full max-w-xs',
                  error: "alert alert-error text-xs gap-2 my-4",
                }}
              />
            ))
          }
        </>
      )}

      {watchPaymentMethod === 'pagoMovil' && (
        <>
          {
            formInputPaymentDataPagoMovil.map((input, index) => (
              <Form.Input
                key={index}
                name={input.name}
                displayName={input.label}
                type={input.type}
                clasess={input.classNames}
                
              />
            ))
          }
          <Form.Select
            name="pagoMovilBank"
            displayName="Banco"
            clasess={{
              container: 'col-span-6 w-full',
              label: 'block text-xs mb-2',
              input: 'input input-bordered w-full',
              error: "alert alert-error text-xs gap-2 my-4",
            }}
            options={venezuelanBanks}
          />
        </>
      )}
    </>
  );
}
