import { FormSchema, PaymentMethods } from '../Checkout/CheckoutForm';
import { UserPaymentMethods, getUserPaymentMethod } from '../Checkout/CheckoutFormUserView';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { PaymentMethod, User } from '../../payload-types';
import { Form } from '../Forms/SmartForm';
import axios from 'axios';
import { apiUrl } from '../../utils/env';
import { useMutation, useQuery } from '@tanstack/react-query';

const patchOrderUser = async (data: any) => {

  // delete data.id from data;
  console.log(data);
  const id = data.id;
  delete data.id

  console.log(data)
  const response = await axios.patch(apiUrl + '/api/orders/' + id, data, {
    // Make sure to include cookies with fetch
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'JWT ' + localStorage.getItem('token'),
    },
  });

  return response.data;
};

type OrderFormProps = {
  user: User;
  orderId: string;
};

export default function OrderForm({ user, orderId }: OrderFormProps) {

  const { push } = useRouter();
  const mutation = useMutation({
    mutationFn: patchOrderUser,
    onSuccess: (data) => {
      console.log(data);
      push({
        pathname: '/thank-you',
        query: {
          order: data.order.id,
        },
      });
    },
    onError: (error) => {
      console.log(error);
    },
  });

  const onSubmit = (data: any) => {
    const orderData = {
      ...data,
      referenceNumber: data.referenceNumber,
      user: user,
      id: orderId,
      status: 'inactive',
    };
    console.log(orderData);
    mutation.mutate(orderData);
  };

  const queryPaymentMethods = useQuery({
    queryKey: ['userPaymentMethods'], 
    queryFn: () => getUserPaymentMethod({ userID: user.id }),
  });

  return (
    <Form schema={FormSchema} onSubmit={onSubmit} classes="grid grid-cols-6 gap-4">
      <div className="col-span-6 grid grid-cols-6 gap-4">
        <h3 className="text-lg font-semibold w-full text-center mb-4 col-span-6">Métodos de pago</h3>
        {/* <PaymentMethods /> */}
        {queryPaymentMethods.isLoading ? (
          <div
            role="status"
            className="col-span-6 w-full space-y-8 animate-pulse md:space-y-0 md:space-x-8 md:flex md:items-center"
          >
            <div className="flex items-center justify-center w-full h-48 bg-neutral-600 rounded  dark:bg-base-100"></div>
          </div>
        ) : null}
        {queryPaymentMethods.isError ? <PaymentMethods /> : <Form.Input
        name="referenceNumber"
        displayName="Número de referencia"
        type="text"
        clasess={{
          container: 'col-span-6 sm:col-span-3',
          label: 'block text-xs mb-2',
          input: 'input input-bordered w-full max-w-xs',
          error: 'alert alert-error text-xs gap-2 my-4',
        }}
      />}

        {queryPaymentMethods.isSuccess ? (
          <UserPaymentMethods paymentMethods={queryPaymentMethods.data as PaymentMethod[]} />
        ) : null}
      </div>
      
      <div className="col-span-6">
        <button
          type="submit"
          className="block w-full rounded-md bg-accent-content text-accent p-2.5 text-sm transition hover:shadow-lg"
        >
          Pagar
        </button>
      </div>
        {mutation.isError ? (  
            <div className="col-span-6">
                <div className="alert alert-error text-xs gap-2 my-4">
                  Algo salió mal, por favor conctate con el administrador del sistema.
                </div>
            </div>
        ) : null}
    </Form>
  );
}
