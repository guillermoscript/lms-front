import axios from 'axios';
import CheckoutForm from '../../components/Checkout/CheckoutForm';
import Layout from '../../components/Layout/Layout';
import payloadClient from '../../utils/axiosPayloadInstance';
import { Product, User } from '../../payload-types';
import CheckoutItem from '../../components/Checkout/CheckoutItem';
import { useAuth } from '@/providers/Auth';'../../components/Auth';
import { forwardRef } from 'react';
import { IndexPageRef } from '../../utils/types/common';
import PageTransition from '../../components/PageTransition';
import { apiUrl } from '../../utils/env';
import { GetServerSidePropsContext } from 'next';

type CheckoutPageProps = {
  data: Product;
}

function CheckoutPage(props: CheckoutPageProps, ref: IndexPageRef) {

  const { user } = useAuth();
  
  return (
    <PageTransition ref={ref}>
      <Layout>
        <section className="py-12 flex flex-col gap-3 lg:py-24">
          <ul className="steps mb-4 max-w[1000px] mx-auto">
          {
              user ? (
                <>
                  <li className="step step-primary">Agregar Metodo de Pago</li>
                  <li className="step">Confirmar Orden</li>
                  <li className="step">Orden Completada</li>
                </>
              ) : (
                <>
                  <li className="step">Registro de Usuario</li>
                  <li className="step">Agregar Metodo de Pago</li>
                  <li className="step">Confirmar Orden</li>
                  <li className="step">Orden Completada</li>
                </>
              ) 
          }
          </ul>
          <div className="w-full mx-auto grid max-w-screen-2xl grid-cols-1 md:grid-cols-2">
            {/* <CheckoutItem
              {...data}
            /> */}

            <h1 className="text-3xl font-bold text-center">Por Hacer el Checkout</h1>
            <div className="  bg-base-300 py-12 md:py-24">
              <div className="mx-auto max-w-lg px-4 lg:px-8">
                {/* <CheckoutForm 
                  user={user ? user : null}
                  productData={data}
                /> */}
                <h3 className="text-3xl font-bold text-center">Por Hacer el Checkout</h3>
              </div>
            </div>
          </div>
        </section>
      </Layout>
    </PageTransition>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {

  const productId = context.query.productId;

  try {
    const response = await axios.get(apiUrl + '/api/products' + productId, {
    // const response = await axios.get<Product>(process.env.NEXT_PUBLIC_CMS_URL + '/api/products/644e84b7b0808709d2584aa2', {
      // Make sure to include cookies with fetch
      withCredentials: true,
      headers: {
        Authorization: `JWT ${context.req.cookies['payload-token']}`,
      },
    });

    console.log(response.data)
    return {
      props: {
        data: response.data,
      }, // will be passed to the page component as props
    };
  } catch (error) {
    console.log(error);
    return {
      props: {
        data: null,
      }, // will be passed to the page component as props
    };
  }
}

export default forwardRef(CheckoutPage)