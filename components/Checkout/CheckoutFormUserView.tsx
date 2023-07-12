import { useMutation, useQuery } from 'react-query';
import { Form } from '../Forms/SmartForm';
import { CheckoutFormProps, FormSchema, PaymentMethods, classNames } from './CheckoutForm';
import payloadClient from '../../utils/axiosPayloadInstance';
import { PaymentMethod, Product, User } from '../../payload-types';
import { useState } from 'react';
import { useRouter } from 'next/router';
import SkeletonAcordion from '../Skeletons/SkeletonAcordion';
import { DaisyUiAlert } from '../Alert/DaisyUiAlerts';
import { PagoMovilUserOrderData, ZelleUserOrderData } from './CheckoutFormGuestView';

type UserPaymentMethodsResponseSuccess = {
  paymentMethods: PaymentMethod[]
};

export const getUserPaymentMethod = async ({ userID }: { userID: string }) => {
  const res = await payloadClient.get('/api/payment-methods/user/' + userID);
  return res.data;
};
type UserOrderDto = {
  paymentMethod: unknown 
  product: Product
  referenceNumber: string;
  amount: number;
  paymentMethodType: 'zelle' | 'pagoMovil';

}
const postUserOrder = async (data: UserOrderDto) => {
  const response = await payloadClient.post('/api/orders/new-user-order', data);
  return response.data;
};


type CheckoutFormUserViewProps = Omit<CheckoutFormProps, 'user'> & {
  user: User;
};

export default function CheckoutFormUserView({ productData, user }: CheckoutFormUserViewProps) {
  
  const { push } = useRouter();
  const mutation = useMutation(postUserOrder, {
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

    if (queryPaymentMethods.isSuccess && queryPaymentMethods.data.length === 0) {
      const paymentMethodSelected = data.paymentMethod;
      const userOrderData = {        
        paymentMethodType: data.paymentMethod,
        paymentMethod: {},
        product: productData,
        referenceNumber: data.referenceNumber,
        amount: productData.productPrice[0].price,
      };

      console.log(userOrderData)

      if (paymentMethodSelected === 'zelle') {
        const zelleUserOrderData: ZelleUserOrderData = {
          ...userOrderData,
          paymentMethod: {
            zelleEmail: data.zelleEmail,
            zelleName: data.zelleName,
          },
        };
        mutation.mutate(zelleUserOrderData);
      } else if (paymentMethodSelected === 'pagoMovil') {
        const pagoMovilUserOrderData: PagoMovilUserOrderData = {
          ...userOrderData,
          paymentMethod: {
            pagoMovilPhone: data.pagoMovilPhone,
            pagoMovilName: data.pagoMovilName,
            pagoMovilBank: data.pagoMovilBank,
            pagoMovilIdn: data.pagoMovilIdn,
          },
        };
        mutation.mutate(pagoMovilUserOrderData);
      }
    }  else {
      const orderData = {
        ...data,
        product: productData,
        amount: productData.productPrice[0].price,
        paymentMethodType: data.paymentMethod,
      }
      console.log(orderData);
      mutation.mutate(orderData);
    }
  };

  const queryPaymentMethods = useQuery(['userPaymentMethods'], () => getUserPaymentMethod({ userID: user.id }));

  if (queryPaymentMethods.isLoading) {
    return <SkeletonAcordion />
  }

  if (queryPaymentMethods.isError) {
    return (
      <div className="my-4">
        <DaisyUiAlert type="error" message={"Algo salio mal"} />
      </div>
    )
  }

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
        {queryPaymentMethods.isSuccess ? (
          <ShowPaymentMethods queryPaymentMethods={queryPaymentMethods} />
        ) : null}
      </div>
      <Form.Input
        name="referenceNumber"
        displayName="Número de referencia"
        type="text"
        clasess={{
          container: 'col-span-6 sm:col-span-3',
          label: 'block text-xs mb-2',
          input: 'input input-bordered w-full max-w-xs',
          error: 'alert alert-error text-xs gap-2 my-4',
        }}
      />
      <div className="col-span-6">
        <button
          type="submit"
          disabled={mutation.isLoading}
          className="btn btn-accent w-full"
        >
          Pagar
        </button>
        {mutation.isError ? (
          <div className="my-4">
            <DaisyUiAlert type="error" message={"Algo salio mal"} />
          </div>
        ) : null}
        {mutation.isSuccess ? (
          <div className="my-4">
            <DaisyUiAlert type="success" message={"Orden creada"} />
            </div>
        ) : null}
      </div>
    </Form>
  );
}

type ShowPaymentMethodsProps = {
  queryPaymentMethods: any
}

function ShowPaymentMethods({ queryPaymentMethods }: ShowPaymentMethodsProps) {

  if (queryPaymentMethods.data.length === 0) {
    return <PaymentMethods />
  }

  if (queryPaymentMethods.data.length > 0) {
    return <UserPaymentMethods paymentMethods={queryPaymentMethods.data as PaymentMethod[]} />
  }

  return null;
}

type PaymentMethodsProps = {
  paymentMethods: PaymentMethod[];
};
// TODO: Display user payment methods
export function UserPaymentMethods({ paymentMethods }: PaymentMethodsProps) {

  return (
    <div className="w-full flex justify-around col-span-6">
      {paymentMethods.map((paymentMethod, index) => {
        return (
          <div key={index}>
            <Form.Radio
              name="paymentMethod"
              displayName={paymentMethod.title}
              value={paymentMethod.id}
              clasess={classNames}
            />
          </div>
        );
      })}
    </div>
  );
}
