import Image from "next/image";
import { CardsTypes } from "../Cards/CardsTypes";
import CategoryCardBadge from "../Cards/CategoryCardBadge";

export type RelatedCoursesProps = CardsTypes;

export default function RelatedCourses({
    title,
    isNew,
    categorys,
    description,
    imgUrl,
    imageAlt,
}: RelatedCoursesProps) {
    const isNeClassName = isNew ? "indicator" : "";
    const isNewText = isNew ? "NEW" : "";

    return (
        <div className="card max-w-4xl bg-base-100 shadow-xl lg:card-side dark:bg-primary-content ">
            <figure>
                <Image
                    src={imgUrl}
                    
                    width={600}
                    height={800}
                    alt={imageAlt}
                />
            </figure>
            <div className={`card-body ${isNeClassName}`}>
                {isNew && (
                    <div className="badge-secondary badge indicator-item">
                        {isNewText}
                    </div>
                )}
                <h3 className="card-title dark:text-primary">{title}</h3>
                <p>{description}</p>

                <div className="card-actions items-center justify-around py-3">
                    {categorys
                        ? categorys.map((category, index) => (
                                <CategoryCardBadge
                                    key={index}
                                    category={category}
                                />
                            ))
                        : null}
                </div>
                <div className="card-actions justify-end">
                    <button className="btn-primary btn">Ver mas</button>
                </div>
            </div>
        </div>
    );
}
