import axios from 'axios';
import { Form } from '../Forms/SmartForm';
import { CheckoutFormGuestViewProps, GuestSchema, GuestSchemaType, PaymentMethods, formInputDataNewUser } from './CheckoutForm';
import { useMutation } from 'react-query';
import { Product } from '../../payload-types';
import { useRouter } from 'next/router';
import { DaisyUiAlert } from '../Alert/DaisyUiAlerts';
import { apiUrl } from '../../utils/env';
import { LoadSpinner } from '../Loaders/DaisyUiLoaders';

export type GuestUserOrderData = {
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
  };
  paymentMethod: {
    zelleEmail?: string;
    zelleName?: string;
    pagoMovilPhone?: string;
    pagoMovilName?: string;
    pagoMovilBank?: string;
    pagoMovilIdn?: string;
  };
  paymentMethodType: 'zelle' | 'pagoMovil';
  product: Product;
  referenceNumber: string;
  amount: number;
};

export type ZelleUserOrderData = Omit<GuestUserOrderData, 'pagoMovilPhone' | 'pagoMovilName' | 'pagoMovilBank' | 'customer'> & {
  paymentMethod: {
    zelleEmail: string;
    zelleName: string;
  };
};

export type PagoMovilUserOrderData = Omit<GuestUserOrderData, 'zelleEmail' | 'zelleName' | 'customer'> & {
  paymentMethod: {
    pagoMovilPhone: string;
    pagoMovilName: string;
    pagoMovilBank: string;
    pagoMovilIdn: string;
  };
};

type UserOrderDto = ZelleUserOrderData | PagoMovilUserOrderData;

const postUserOrder = async (data: UserOrderDto) => {
  const response = await axios.post(apiUrl + '/api/orders/new-user-order', data);
  return response.data;
};

export default function CheckoutFormGuestView({ productData }: CheckoutFormGuestViewProps) {
  
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
    const paymentMethodSelected = data.paymentMethod;
    const userOrderData = {
      customer: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        password: data.password,
      },
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
  };

  return (
    <Form schema={GuestSchema} onSubmit={onSubmit} classes="grid grid-cols-6 gap-4">
      {formInputDataNewUser.map((input, index) => {
        return (
          <Form.Input
            key={index}
            name={input.name}
            displayName={input.label}
            type={input.type}
            clasess={input.classNames}
          />
        );
      })}
      <div className="col-span-6 grid grid-cols-6 gap-4">
        <h3 className="text-lg font-semibold w-full text-center mb-4 col-span-6">Métodos de pago</h3>
        <PaymentMethods />
        <Form.Input
          name="referenceNumber"
          displayName="Número de referencia"
          type="text"
          clasess={{
            container: 'col-span-6 sm:col-span-3',
            label: 'block text-xs mb-2',
            input: 'input input-bordered w-full max-w-xs',
            error: "alert alert-error text-xs gap-2 my-4",
          }}
        />
      </div>
      <div className="col-span-6">
        <button
          type="submit"
          disabled={mutation.isLoading}
          className="block w-full rounded-md bg-accent-content text-accent p-2.5 text-sm transition hover:shadow-lg"
        >
          Pagar
        </button>
      </div>
      {mutation.isError && <DaisyUiAlert type="error" message={"Algo salio mal"} />}
      {mutation.isLoading && <LoadSpinner size='lg' />}
    </Form>
  );
}
