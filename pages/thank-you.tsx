import Link from 'next/link';
import Layout from '../components/Layout/Layout';
import { CONTACT_EMAIL } from '../utils/constants';
import { IndexPageRef } from '../utils/types/common';
import { forwardRef } from 'react';
import { useAuth } from '../components/Auth';


function ThankYouPage(props: any, ref: IndexPageRef) {
  
  const  { user } = useAuth();

  return (
    <Layout>
        <div className="bg-base-300 p-6 md:mx-auto flex flex-col border border-base-200 rounded-md max-w-md md:my-20">
          <svg viewBox="0 0 24 24" className="text-success  w-16 h-16 mx-auto my-4">
            <path
              fill="currentColor"
              d="M12,0A12,12,0,1,0,24,12,12.014,12.014,0,0,0,12,0Zm6.927,8.2-6.845,9.289a1.011,1.011,0,0,1-1.43.188L5.764,13.769a1,1,0,1,1,1.25-1.562l4.076,3.261,6.227-8.451A1,1,0,1,1,18.927,8.2Z"
            ></path>
          </svg>
          <div className="text-center">
            <h3 className="md:text-2xl text-base font-semibold text-center">Pago en proceso</h3>
            <p className="text-gray-600 my-2">Estamos procesando tu pago, en breve recibirás un correo con los detalles de tu compra.</p>
            <p> Si tienes alguna duda, puedes contactarnos a través de nuestro correo electrónico:  
                <a  className="text-primary"
                    href={`mailto:${CONTACT_EMAIL}`}>
                    {CONTACT_EMAIL}
                </a>
            </p>
            <div className="py-10 text-center">
                <Link 
                  className="btn btn-primary"
                  href={ user ? '/dashboard/account' : '/auth/login' }>
                    
                      { user ? 'Ir a mi cuenta' : 'Iniciar sesión'}
                    
                </Link>
            </div>
          </div>
        </div>
    </Layout>
  );
}

export default forwardRef(ThankYouPage)