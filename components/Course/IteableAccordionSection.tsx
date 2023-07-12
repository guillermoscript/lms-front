import Link from "next/link";
import { Course, Lesson, Evaluation } from "../../payload-types";

type IterableAccordionSectionProps = {
  iterableKeyValue: {
    singular: string;
    plural: string;
    link: string;
  };
  course: Course;
  iterable: Lesson[] | Evaluation[];
  userId: string;
  children: React.ReactNode;
};

export default function IterableAccordionSection({ iterable, children, iterableKeyValue,  }: IterableAccordionSectionProps) {
  const isSingular = iterable.length === 1;

  return (
    <div className="flex flex-col mb-4">
      <h4 className="text-xl font-bold mb-6">{isSingular ? iterableKeyValue.singular : iterableKeyValue.plural}</h4>
      <div className="flex flex-row flex-wrap">
        {children}
      </div>
    </div>
  );
}

type IterableAccordionProps = {
  iterable: Lesson | Evaluation;
  userId: string;
  iterableKeyValue: {
    singular: string;
    plural: string;
    link: string;
  };
};

export function IterableAccordion({ iterable, iterableKeyValue, userId }: IterableAccordionProps) {
  const isCompletedByUser = iterable?.completedBy
    ?.map((value) => (typeof value === 'string' ? value : value.id))
    .find((value) => value === userId);
    
    
  return (
    <div className="collapse collapse-arrow bg-base-200 my-3">
      <input type="radio" name="my-accordion-2" />
      <h4 className="collapse-title text-xl font-medium">
        {iterable.name}
        {isCompletedByUser && (
          <div className="badge badge-info ml-3">
            <div className="badge-content">Completado</div>
          </div>
        )}
      </h4>
      <div className="collapse-content">
        <Link href={`${iterableKeyValue.link}/${iterable.id}`}>
          <a>
            <p className="text-lg mb-6 link link-accent">{iterable.description}</p>
          </a>
        </Link>
      </div>
    </div>
  );
}
