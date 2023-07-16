import Image from 'next/image';
import Link from 'next/link';

type ReleatedProductProps = {
  title: string;
  price: number;
  imgURL: string;
  imgAlt: string;
  productId: string;
  currency: string;
};

export default function ReleatedProduct({ title, price, imgAlt, imgURL, productId, currency }: ReleatedProductProps) {
  return (
    <div className="group relative">
      <div className="aspect-h-1 aspect-w-1 w-full overflow-hidden rounded-md bg-content-200 lg:aspect-none group-hover:opacity-75 lg:h-80">
        <img src={imgURL} alt={imgAlt} className="h-full w-full object-cover object-center lg:h-full lg:w-full" />
      </div>
      <div className="mt-4 gap-3 flex justify-between">
        <div>
          <h3 className="text-sm text-secondary">
            <Link href={`/product/${productId}`}>
              <a>
                <span aria-hidden="true" className="absolute inset-0" />
                {title}
              </a>
            </Link>
          </h3>
        </div>
        <p className="text-sm font-medium">
          {currency} {price}
        </p>
      </div>
    </div>
  );
}
