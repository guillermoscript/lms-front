import Image from "next/image";
import Link from "next/link";
import { CardsTypes } from "../Cards/CardsTypes";
import CategoryCardBadge from "../Cards/CategoryCardBadge";
import { useMediaQuery } from "usehooks-ts";

export type PlanCardProps = CardsTypes & {
    id: string;
}

export default function PlanCard({
    id,
    title,
    isNew,
    categorys,
    description,
    imgUrl,
    imageAlt,
}: PlanCardProps) {

    const matches = useMediaQuery('(min-width: 768px)');
    const width = matches ? 800 : 400;
    const height = matches ? 600 : 300;

    return (
        <div className="card w-96 mb-10 bg-base-100 shadow-xl">
            <figure>
                <Image
                    src={imgUrl}
                    className="rounded-lg rounded-b-none p-5 shadow-2xl dark:bg-base-100"
                    width={width}
                    height={height}
                    alt={imageAlt}
                />
            </figure>
            <div className="card-body">
                <h2 className="card-title">
                    {title}
                    {isNew && <div className="badge-secondary badge">NEW</div>}
                </h2>
                <p className="card-subtitle mb-5">
                    {description}
                </p>
                {/* <div className="card-actions justify-end">
                </div> */}
                <div className="card-actions justify-between items-center">
                    <Link
                        href={`/product/${id}`}
                        className="btn btn-primary"
                    >
                        Ver más
                    </Link>
                    {categorys
                        ? categorys.map((category, index) => (
                            <CategoryCardBadge key={index} category={category} />
                        ))
                        : null}
                </div>
            </div>
        </div>
    );
}
