import { forwardRef } from "react";
import PageTransition from "../components/PageTransition";
import Layout from "../components/Layout/Layout";
import { IndexPageRef, PaginatedDocs } from "../utils/types/common";
import axios from "axios";
import { Product } from "../payload-types";
import ReleatedProduct from "../components/Product/RelatedProduct";
import { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { apiUrl } from "../utils/env";

type StorePageProps = {
    data: PaginatedDocs<Product>
};

function StorePage(props: StorePageProps , ref: IndexPageRef) {

    const { data } = props;

    const products = data.docs

    return (      
        <PageTransition ref={ref}>
            <Layout>
            <div className="bg-content">
                <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24 lg:max-w-7xl lg:px-8">
                <h2 className="text-2xl font-bold tracking-tight">Productos Disponibles</h2>
                    <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4 xl:gap-x-8">
                        {products.map((product) => {
                            return (
                            <ReleatedProduct
                                key={product.id}
                                title={product.name}
                                price={product.productPrice[0].price}
                                imgAlt={product.name}
                                imgURL={(product.productImage as any)?.url}
                                productId={product.id}
                                currency={product.productPrice[0].aceptedCurrency}
                            />
                            );
                        })}
                    </div>
                    <div className="mt-6">
                    <div className="join grid grid-cols-2 px-4">
                        {data.hasPrevPage && (
                            <Link href={`/store?page=${data.prevPage}`}>
                                <a className="join-item btn btn-outline">Prev</a>
                            </Link>
                        )}
                        {data.hasNextPage && (
                            <Link href={`/store?page=${data.nextPage}`}>
                                <a className="join-item btn btn-outline">Next</a>
                            </Link>
                        )} 
                    </div>
                    </div>
                </div>
            </div>
            </Layout>
        </PageTransition>
    );
}

export default forwardRef(StorePage);


export async function getServerSideProps({ query, req }: GetServerSidePropsContext) {

    const { page } = query;

    try{
        const response = await axios.get<PaginatedDocs<Product>>(apiUrl + '/api/products/', {
            // Make sure to include cookies with fetch
            // withCredentials: true,
            params: {
                page: page || 1
            },
        })
        
        return {
            props: {
                data: response.data
            }, // will be passed to the page component as props
        }
    } catch (error) {

        console.log(error)
        return {
            props: {
                data: null
            }, // will be passed to the page component as props
        }
    }
}