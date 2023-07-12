import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import { IndexPageRef } from '../../../utils/types/common';
import PageTransition from '../../../components/PageTransition';
import RegisterForm from '../../../components/Auth/RegisterForm';
import Image from 'next/image';
import Layout from '../../../components/Layout/Layout';
import { ROUTES } from '../../../utils/constants';

type FormData = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

const CreateAccount = (ref: IndexPageRef) => {

  return (
    <PageTransition ref={ref}>
      <Layout>
        <div className="w-full py-9 flex items-center justify-center">
          <div className="w-full flex items-center justify-center">
            <div className="w-full h-full flex items-center justify-center  sm:w-1/2 lg:w-1/2 xl:w-1/2 2xl:w-1/2">
              <div className="w-full px-8">
                <div className="hero min-h-screen bg-base-200">
                  <div className="w-full px-6 flex-col lg:flex-row-reverse">
                    <section className=" w-full  ">
                      <div className="flex flex-col items-center justify-center py-8 mx-auto lg:py-0">
                        <a
                          href="#"
                          className="flex items-center mb-6 text-2xl font-semibold text-gray-900 dark:text-white"
                        >
                          LOGO
                        </a>
                        <div className="w-full rounded-lg md:mt-0 sm:max-w-md xl:p-0 ">
                          <div className="space-y-4 md:space-y-6">
                            <h1 className="text-xl font-bold leading-tight tracking-tight md:text-2xl">
                              Registrate ahora!
                            </h1>
                            <RegisterForm />
                            <p className="text-center text-sm  mt-2">
                              Ya tienes una cuenta?{' '}
                              <Link href={ROUTES.auth.login}>
                                <a
                                  className="text-primary hover:text-primary-focus hover:underline"
                                  title="Iniciar sesión"
                                >
                                  Inicia sesión
                                </a>
                              </Link>
                            </p>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>
            <div className="hidden lg:flex lg:w-1/2 xl:w-2/3 2xl:w-3/4 h-full bg-cover">
              <div className="w-full h-full flex flex-col items-center justify-center bg-opacity-30">
                <div className="flex items-center justify-center space-x-2">
                  <Image src="/icons/conference.svg" width={532} height={532} alt="logo" />
                </div>
                <h1 className="text-3xl xl:text-4xl 2xl:text-5xl font-bold text-primary  tracking-wider">Bienvenido</h1>
                <p className="mt-4 px-16 text-center">
                  Los mejores cursos de programación, diseño y marketing digital. Aprende de los mejores profesionales
                  de la industria.
                </p>
                <a
                  href="#"
                  className="mt-6  px-6 py-2 rounded text-sm uppercase transition duration-150 text-secondary bg-secondary-content  hover:text-secondary-focus hover:shadow-lg focus:outline-none"
                  title="Learn More"
                >
                  Aprender más
                </a>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </PageTransition>
  );
};

export default CreateAccount;
