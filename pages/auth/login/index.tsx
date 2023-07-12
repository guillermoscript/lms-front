import React, { forwardRef, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import LoginForm from '../../../components/Auth/LoginForm';
import { IndexPageRef } from '../../../utils/types/common';
import PageTransition from '../../../components/PageTransition';
import Layout from '../../../components/Layout/Layout';

type FormData = {
  email: string;
  password: string;
};

const Login = (ref: IndexPageRef) => {
  const [error, setError] = useState('');
  const router = useRouter();
  useEffect(() => {
    if (router.query.unauthorized) {
      setError(`Para acceder a ${router.query.unauthorized}, primero debe iniciar sesión.`);
    }
  }, [router]);

  return (
    <PageTransition ref={ref}>
      <Layout>
        <div className="hero min-h-screen bg-base-200">
          <div className="flex-col flex lg:items-center lg:flex-row-reverse">
            <div className="text-center px-8 lg:text-left py-8">
              <h1 className="text-5xl font-bold">Login now!</h1>
              <p className="py-6">
                Provident cupiditate voluptatem et in. Quaerat fugiat ut assumenda excepturi exercitationem quasi. In
                deleniti eaque aut repudiandae et a id nisi.
              </p>
            </div>

            <section className="bg-secondary-content w-full max-w-lg p-10 shadow-2xl ">
              <div className="flex flex-col items-center justify-center py-8 mx-auto lg:py-0">
                <a href="#" className="flex items-center mb-6 text-2xl font-semibold text-gray-900 dark:text-white">
                  LOGO
                </a>
                <div className="w-full rounded-lg md:mt-0 sm:max-w-md xl:p-0 ">
                  <div className="space-y-4 md:space-y-6 sm:p-8">
                    <h1 className="text-xl font-bold leading-tight tracking-tight text-gray-900 md:text-2xl dark:text-white">
                      Iniciar sesión
                    </h1>
                    <LoginForm />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </Layout>
    </PageTransition>
  );
};

export default forwardRef(Login);
