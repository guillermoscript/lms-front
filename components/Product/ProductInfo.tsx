import Link from 'next/link';
import { Product } from '../../payload-types';
import Reviews from '../Reviews/Reviews';
import { RichText } from '../RichText';

type ProductInfoProps = {
  name: string;
  prices: Product['productPrice'];
  description: string;
  info: any;
  productId: string;
  children?: React.ReactNode;
};

export default function ProductInfo({ name, prices, description, info, productId, children }: ProductInfoProps) {
  return (
    <>
      {/* Product info */}
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-10 sm:px-6 lg:grid lg:max-w-7xl lg:grid-cols-3 lg:grid-rows-[auto,auto,1fr] lg:gap-x-8 lg:px-8 lg:pb-24 lg:pt-16">
        <div className="lg:col-span-2 lg:border-r lg:border-gray-200 lg:pr-8">
          <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">{name}</h1>
        </div>

        {/* Options */}
        <div className="mt-4 lg:row-span-3 lg:mt-0">
          <h2 className="sr-only ">Informacion de producto</h2>
          {prices.map((price, index) => (
            <p key={index} className="text-3xl tracking-tight ">
              {price.aceptedCurrency} {price.price}
            </p>
          ))}

          {/* Description and details */}
          <div className="mt-6">
            <h3 className="sr-only">Descripcion corta</h3>

            <div className="space-y-6">
              <p className="text-base">{description}</p>
            </div>
          </div>
          <div className="mt-6">
            <Link
              className="flex items-center justify-center btn btn-accent"
              href={`/checkout/${productId}`}>
              
                Comprar
              
            </Link>
          </div>
          {/* Reviews */}
          <Reviews reviewableId={productId} relationTo="product" />
        </div>

        <div className="py-10 lg:col-span-2 lg:col-start-1 lg:border-r lg:border-gray-200 lg:pb-16 lg:pr-8 lg:pt-6">
          <div className="mt-10">
            <h2 className="text-sm font-medium">Detalles</h2>
            <div className="mt-4 space-y-6">
              <RichText content={info} />
            </div>
          </div>
        </div>
        {children}
      </div>
    </>
  );
}
