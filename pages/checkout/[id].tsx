import axios, { AxiosResponse } from 'axios';
import CheckoutForm from '../../components/Checkout/CheckoutForm';
import Layout from '../../components/Layout/Layout';
import payloadClient from '../../utils/axiosPayloadInstance';
import { PagoMovil, Product, User, Zelle } from '../../payload-types';
import CheckoutItem from '../../components/Checkout/CheckoutItem';
import { useAuth } from '@/providers/Auth';'../../components/Auth';
import { forwardRef } from 'react';
import { IndexPageRef } from '../../utils/types/common';
import PageTransition from '../../components/PageTransition';
import { GetServerSidePropsContext } from 'next';
import { apiUrl } from '../../utils/env';
import tryCatch from '../../utils/tryCatch';
import AdminPaymentMethods from '../../components/Checkout/AdminPaymentMethods';

type CheckoutPageProps = {
  data: Product;
  zelle: Zelle
  pagoMovil: PagoMovil
}

function CheckoutPage(props: CheckoutPageProps, ref: IndexPageRef) {

  const { user } = useAuth();
  const { data, zelle, pagoMovil } = props;

  if (!data) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-screen">
          <h1 className="text-2xl">No se pudo cargar el producto</h1>
        </div>
      </Layout>
    )
  }
  
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
                </>
              ) 
          }
          </ul>
          <div className="w-full mx-auto grid max-w-screen-2xl grid-cols-1 md:grid-cols-2">
            <CheckoutItem {...data} >
              <AdminPaymentMethods zelle={zelle} pagoMovil={pagoMovil} />
            </CheckoutItem>
            <div className="  bg-base-300 py-12 md:py-24">
              <div className="mx-auto max-w-lg px-4 lg:px-8">
                <CheckoutForm 
                  user={user ? user : null}
                  productData={data}
                />
              </div>
            </div>
          </div>
        </section>
      </Layout>
    </PageTransition>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {

  const productId = context.query.id;

    const [response, responseError] = await tryCatch<AxiosResponse<Product>>(axios.get(apiUrl + '/api/products/' + productId, {
      // const response = await payloadClient.get('/api/products' + productId, {
      // const response = await axios.get<Product>(process.env.NEXT_PUBLIC_CMS_URL + '/api/products/644e84b7b0808709d2584aa2', {
        // Make sure to include cookies with fetch
        withCredentials: true,
        headers: {
          Authorization: `JWT ${context.req.cookies['payload-token']}`,
        },
      }))

    if (responseError) {
      console.log(responseError)
      return {
        props: {
          data: null,
        }
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
        data: response?.data,
        zelle: zelle?.data,
        pagoMovil: pagoMovil?.data,
      }, // will be passed to the page component as props
    };
}

export default forwardRef(CheckoutPage)