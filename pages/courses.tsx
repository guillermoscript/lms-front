import axios from 'axios';
import { useRouter } from 'next/router';
import { forwardRef } from 'react';
import CoursesCards from '../components/Courses/CoursesCard';
import Layout from '../components/Layout/Layout';
import PageTransition from '../components/PageTransition';
import Pagination from '../components/Pagination';
import { Product, Media, Course, Plan, Category } from '../payload-types';
import { PaginatedDocs, IndexPageRef } from '../utils/types/common';
import Image from 'next/image';
import { GetServerSidePropsContext } from 'next';
import Link from 'next/link';
import { apiUrl } from '../utils/env';

type CoursesPageProps = {
  data: Product[];
  paginationData: Omit<PaginatedDocs<Product>, 'docs'>;
};

function CoursesPage(props: CoursesPageProps, ref: IndexPageRef) {
  const { data, paginationData } = props;
  const { push } = useRouter();

  const cardData = data.map((doc) => {
    const imgUrl = doc.productImage as Media;
    const imageAlt = doc.productImage as Media;
    const relation = doc.productType?.relationTo;
    const categorysToChoose = {
      courses: doc.productType?.value as Course,
      plans: doc.productType?.value as Plan,
    };
    const categorysData = categorysToChoose[relation as keyof typeof categorysToChoose];
    const categorys = categorysData.category?.map((cat) => {
      const a = cat as Category;
      return a.name;
    });
    return {
      id: doc.id,
      title: doc.name,
      isNew: true,
      categorys: doc.productType?.value,
      description: doc.description,
      imgUrl: imgUrl?.url as string,
      imageAlt: imageAlt.altText as string,
    };
  });

  return (
    <PageTransition ref={ref}>
      <Layout>
        <div className="hero min-h-screen bg-base-200">
          <div className="hero-content flex-col lg:flex-row-reverse">
            <Image width={1000} height={800} src="/images/home/home3.jpg" className="max-w-sm rounded-lg shadow-2xl" />
            <div>
              <h1 className="text-5xl font-bold">Box Office News!</h1>
              <p className="py-6">
                Provident cupiditate voluptatem et in. Quaerat fugiat ut assumenda excepturi exercitationem quasi. In
                deleniti eaque aut repudiandae et a id nisi.
              </p>
              <button className="btn btn-primary">Get Started</button>
            </div>
          </div>
        </div>

        <div className="p-8 md:px-32">
          {/* <CoursesTab /> */}

          <h2 className="text-5xl text-secondary font-bold mb-6">Todos Nuestros Cursos</h2>
          <p className="text-2xl font-bold mb-6">Aprende con nosotros</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-24  px-4">
            {cardData.map((card) => (
              <CoursesCards
                key={card.id}
                title={card.title}
                description={card.description}
                src={card.imgUrl}
                width={500}
                height={300}
                action={
                  <div className="card-actions justify-end">
                    <Link
                      href={{
                        pathname: '/product/[id]',
                        query: { id: card.id },
                      }}
                    >
                      <a className="btn btn-primary">Ver Detalles</a>
                    </Link>
                  </div>
                }
                alt={card.imageAlt}
              />
            ))}

            <div className="btn-group">
              <Pagination
                totalDocs={paginationData.totalDocs}
                limit={paginationData.limit}
                totalPages={paginationData.totalPages}
                page={paginationData.page}
                pagingCounter={paginationData.pagingCounter}
                hasPrevPage={paginationData.hasPrevPage}
                hasNextPage={paginationData.hasNextPage}
                prevPage={paginationData.prevPage}
                nextPage={paginationData.nextPage}
                onClick={(page) => {
                  push({
                    pathname: '/courses',
                    query: { page },
                  });
                }}
              />
            </div>
          </div>
        </div>
      </Layout>
    </PageTransition>
  );
}

export async function getServerSideProps({ query }: GetServerSidePropsContext) {
  const page = query.page || 1;

  try {
    const response = await axios.get<PaginatedDocs<Product>>(apiUrl + '/api/products/', {
      params: {
        page,
        limit: 5,
      },
      // Make sure to include cookies with fetch
      // withCredentials: true,
    });

    console.log(response.data);

    return {
      props: {
        data: response.data.docs,
        paginationData: {
          totalDocs: response.data.totalDocs,
          limit: response.data.limit,
          totalPages: response.data.totalPages,
          page: response.data.page,
          pagingCounter: response.data.pagingCounter,
          hasPrevPage: response.data.hasPrevPage,
          hasNextPage: response.data.hasNextPage,
          prevPage: response.data.prevPage,
          nextPage: response.data.nextPage,
        },
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

export default forwardRef(CoursesPage);
