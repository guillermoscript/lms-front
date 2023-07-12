import Image from 'next/image';
import { Category, Course, Media, Plan, Product } from '../../payload-types';

export default function CheckoutItem({ name, description, productPrice, productImage, productType }: Product) {
  const productImages = productImage as Media;
  const relation = productType?.relationTo;
  const categorysToChoose = {
    courses: productType?.value as Course,
    plans: productType?.value as Plan,
  };
  const categorysData = categorysToChoose[relation as keyof typeof categorysToChoose];
  console.log(categorysData);
  console.log(relation);
  const categorys = categorysData.category?.map((cat) => {
    const a = cat as Category;
    return a.name;
  });
  return (
    <div className="py-12 md:py-24  bg-base-200">
      <div className="mx-auto max-w-lg space-y-8 px-4 lg:px-8">
        <div className="flex items-center gap-4">
          <span className="h-10 w-10 rounded-full bg-primary"></span>
        </div>

        <div>
          <h1 className="mt-1 heading-1">Total de Orden:</h1>
          {productPrice?.map((price, index) => (
            <p key={index} className="text-sm md:text-base ">
                {price.aceptedCurrency}: {price.price}
            </p>
            ))}
        </div>

        <div>
          <div className="flow-root">
            <ul className="-my-4 divide-y divide-gray-100">
              <li className="flex items-center gap-4 py-4">
                <div>
                  <h3 className=" text-2xl md:text-3xl font-bold mb-2">{name}</h3>

                  <div className="mt-0.5 space-y-px">
                    <div>
                      <p className="text-sm md:text-base ">{description}</p>
                    </div>
                    <div>
                      {productPrice?.map((price, index) => (
                        <p key={index} className="text-sm md:text-base ">
                          {price.aceptedCurrency}: {price.price}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </li>

              <li className="flex items-center gap-4 py-4">
                <Image
                  src={productImages.url as string}
                  alt="Product"
                  width={88}
                  height={88}
                  className="flex-shrink-0 rounded-full"
                />

                {relation === 'plans' ? (
                  <div className='flex flex-row flex-wrap gap-4'>
                    <h3 className="">Cursos Incluidos:</h3>

                    {categorysToChoose.plans.courses?.map((course) => {
                      const data = course as Course;

                      return (
                        <div key={data.id}>
                          <div className="badge badge-primary">{data.name}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
