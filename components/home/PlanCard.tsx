import Image from "next/image";
import Link from "next/link";
import { CardsTypes } from "../Cards/CardsTypes";
import CategoryCardBadge from "../Cards/CategoryCardBadge";

export type PlanCardProps = CardsTypes

export default function PlanCard({
    title,
    isNew,
    categorys,
    description,
    imgUrl,
    imageAlt,
}: PlanCardProps) {
    return (
        <div className="card w-96 bg-base-100 shadow-xl">
            <figure>
                <Image
                    src={imgUrl}
                    className="rounded-lg rounded-b-none p-5 shadow-2xl dark:bg-base-100"
                    width={800}
                    height={600}
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
                        href="/courses/[id]"
                        as={`/courses/${title}`}
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
