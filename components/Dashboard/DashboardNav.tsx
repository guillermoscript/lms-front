import Link from 'next/link';
import { Course, Evaluation, Lesson } from '../../payload-types';
import { useRouter } from 'next/router';

type DashboardNavProps = {
  iterable: Lesson[] | Course[] | Evaluation[];
  link: string;
  idOfParam: string;
  iterableName: string;
};

export default function DashboardNav({ iterable, idOfParam, link, iterableName }: DashboardNavProps) {
  const router = useRouter();
  const idToCompare = router.query[idOfParam];

  return (
    <>
      <h5 className="group w-full flex items-center rounded-lg p-2 text-primary font-normal text-xl">{iterableName}</h5>
      <ul className="flex flex-col w-full ">
        {iterable?.map((value) => {
          return (
            <li key={value.id}>
              <Link
                className={`group flex my-1 items-center rounded-lg p-2 text-base font-normal transition duration-75 hover:bg-secondary-content focus:bg-secondary-content ${
                  idToCompare == value.id ? 'text-secondary-focus' : ''
                } text-ellipsis`}
                href={`${link}/${value.id}`}
              >
                {value.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
