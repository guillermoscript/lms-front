import Layout from '../../components/Layout/Layout';
import axios from 'axios';
import { GetServerSidePropsContext, GetStaticPaths, GetStaticPropsContext } from 'next';
import { Course, Lesson, Plan, Product } from '../../payload-types';
import Image from 'next/image';
import BreadCrumbs from '../../components/Breadcrumbs/Breadcrumbs';
import { IndexPageRef } from '../../utils/types/common';
import ProductInfo from '../../components/Product/ProductInfo';
import ReleatedProduct from '../../components/Product/RelatedProduct';
import Link from 'next/link';
import { apiUrl } from '../../utils/env';

function CourseDetails({ data }: { data: Product }) {
  console.log(data, 'dat');
  return (
    <div className="flex flex-col gap-4 w-full py-10 lg:col-span-2 lg:col-start-1 lg:border-r lg:border-gray-200 lg:pb-16 lg:pr-8 lg:pt-6">
      <h4 className="text-xl font-semibold">Lecciones Incluidas en el Curso</h4>
      <div className="flex flex-wrap gap-3 w-full space-y-2">
        <div className="flex gap-3 flex-wrap items-center">
          {(data.productType?.value as Course)?.lessons?.map((lesson) => {
            const lessonAsLesson = lesson as Lesson;
            return (
              <p key={lessonAsLesson.id} className="badge badge-secondary">
                {lessonAsLesson.name}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlanDetails({ data }: { data: Product }) {
  return (
    <div className="flex flex-col gap-4 w-full py-10 lg:col-span-2 lg:col-start-1 lg:border-r lg:border-gray-200 lg:pb-16 lg:pr-8 lg:pt-6">
      <h4 className="text-xl font-semibold">Cursos Incluidos en el Plan</h4>
      <div className="flex flex-wrap gap-3 w-full space-y-2">
        <div className="flex gap-3 flex-wrap items-center">
          {(data.productType?.value as Plan)?.courses?.map((course) => {
            const courseAsCourse = course as Course;
            return (
              <p key={courseAsCourse.id} className="badge badge-secondary">
                {courseAsCourse.name}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type ProductProps = {
  data: Product;
};

export default function ProductPage(props: ProductProps, ref: IndexPageRef) {
  const { data } = props;

  return (
    <Layout>
      <div className="bg-content-200">
        <div className="pt-6">
          <nav aria-label="Breadcrumb" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <BreadCrumbs
              data={[
                {
                  url: '/',
                  name: 'Inicio',
                },
                {
                  url: '/store',
                  name: 'Productos',
                },
                {
                  url: `/product/${data.id}`,
                  name: data.name,
                },
              ]}
            />
          </nav>
          <div className="hero bg-base-200">
            <div className="hero-content text-center">
              <div className="max-w-md">
                <Image
                  src={(data.productImage as any)?.url}
                  className="relative h-full w-full object-contain"
                  width="600"
                  height="600"
                />
              </div>
            </div>
          </div>

          <ProductInfo
            productId={data.id}
            name={data.name}
            prices={data.productPrice}
            description={data.description}
            info={data.info}
          >
            <>
              {data.productType?.relationTo === 'plans' && <PlanDetails data={data} />}
              {/* {data.productType?.relationTo === 'courses' && <CourseDetails data={data} />} */}
            </>
          </ProductInfo>
          <div className="bg-content">
            <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24 lg:max-w-7xl lg:px-8">
              {data?.relatedProducts && data.relatedProducts.length > 0 && (
                <>
                  <h2 className="text-2xl font-bold tracking-tight">Productos Relacionados</h2>
                  <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4 xl:gap-x-8">
                    {data.relatedProducts.map((product) => {
                      if (typeof product === 'string') {
                        return null;
                      }

                      const url = (product.productImage as any)?.url;
                      const price = product.productPrice[0].price;

                      return (
                        <ReleatedProduct
                          key={product.id}
                          title={product.name}
                          price={price}
                          imgAlt={product.name}
                          imgURL={url}
                          productId={product.id}
                          currency={product.productPrice[0].aceptedCurrency}
                        />
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// export const getStaticPaths: GetStaticPaths = async () => {
//   // const response = await payloadClient.get<Product[]>('/api/courses');
//   const response = await axios.get<Product[]>(apiUrl + '/api/products');

//   const paths = response.data.map((product) => ({
//     params: { id: product.id },
//   }));

//   return { paths, fallback: false };
// }

// TODO: volver esto a static props
export async function getServerSideProps({ query, req }: GetServerSidePropsContext) {
  // export async function getStaticProps({ params }: GetStaticPropsContext) {

  // const { id } = params;
  const { id } = query;

  try {
    // const response = await payloadClient.get<Product>('/api/courses/' + id,
    const response = await axios.get<Product>(
      apiUrl + '/api/products/' + id,
      // apiUrl + '/api/products/644e84f5b0808709d2584ae2',
      {
        withCredentials: true,
        headers: {
          Authorization: `JWT ${req.cookies['payload-token']}`,
        },
      },
    );

    console.log(response.data);

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
