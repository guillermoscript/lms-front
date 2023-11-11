import axios, { AxiosResponse } from 'axios';
import CheckoutForm from '../../../components/Checkout/CheckoutForm';
import Layout from '../../../components/Layout/Layout';
import { Order, PagoMovil, Product, User, Zelle } from '../../../payload-types';
import CheckoutItem from '../../../components/Checkout/CheckoutItem';
import { useAuth } from '@/providers/Auth';'../../../components/Auth';
import { forwardRef } from 'react';
import { IndexPageRef, UserMeResponse } from '../../../utils/types/common';
import PageTransition from '../../../components/PageTransition';
import { GetServerSidePropsContext } from 'next';
import OrderForm from '../../../components/Order/OrderForm';
import { apiUrl } from '../../../utils/env';
import tryCatch from '../../../utils/tryCatch';
import AdminPaymentMethods from '../../../components/Checkout/AdminPaymentMethods';

type OrderPageProps = {
  data: Product;
  user: User;
  zelle: Zelle
  pagoMovil: PagoMovil
}

function OrderPage(props: OrderPageProps, ref: IndexPageRef) {

  const { data, user, zelle, pagoMovil } = props;

  console.log(user)
  
  return (
    <PageTransition ref={ref}>
      <Layout>
        <section className="py-12 flex flex-col gap-3 lg:py-24">
          <ul className="steps mb-4 max-w[1000px] mx-auto">            
            <li className="step">Pagar Orden</li>
            <li className="step">Orden Completada</li>
          </ul>
          <div className="w-full mx-auto grid max-w-screen-2xl grid-cols-1 md:grid-cols-2">
            <div className='flex flex-col gap-3 p-4 bg-base-200'>
              <AdminPaymentMethods zelle={zelle} pagoMovil={pagoMovil} />
            </div>
            <div className="  bg-base-300 py-12 md:py-24">
              <div className="mx-auto max-w-lg px-4 lg:px-8">
                <OrderForm orderId={data.id} user={user}/>
              </div>
            </div>
          </div>
        </section>
      </Layout>
    </PageTransition>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {

  const orderId = context.query.id;

  try {
    const response = await axios.get<Order>(apiUrl + '/api/orders/' + orderId, {
      // const response = await payloadClient.get('/api/products' + productId, {
      // const response = await axios.get<Product>(apiUrl + '/api/products/644e84b7b0808709d2584aa2', {
      // Make sure to include cookies with fetch
      withCredentials: true,
      headers: {
        Authorization: `JWT ${context.req.cookies['payload-token']}`,
      },
    });

    const user = await axios.get<UserMeResponse>(apiUrl + '/api/users/me', {
      // Make sure to include cookies with fetch
      withCredentials: true,
      headers: {
        Authorization: `JWT ${context.req.cookies['payload-token']}`,
      },
    });


    console.log(response.data)

    if (response.data.status !== 'pending') {
      return {
        redirect: {
          destination: '/dashboard/account/',
          permanent: false,
        },
      }
    }


    const [pagoMovil, pagoMovilError] = await tryCatch<AxiosResponse<User>>(axios.get(apiUrl + '/api/globals/pago-movil/'))

    if (pagoMovilError) {
      console.log(pagoMovilError)
    }

    const [zelle, zelleError] = await tryCatch<AxiosResponse<User>>(axios.get(apiUrl + '/api/globals/zelle/'))

    if (zelleError) {
      console.log(zelleError)
    }

    return {
      props: {
        data: response.data,
        user: user.data.user,
        zelle: zelle?.data,
        pagoMovil: pagoMovil?.data,
      }, // will be passed to the page component as props
    };
  } catch (error) {
    console.log(error);
    return {
      redirect: {
        destination: '/dashboard/account/',
        permanent: false,
      }
    };
  }
}

export default forwardRef(OrderPage)