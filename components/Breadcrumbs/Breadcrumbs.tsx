import Link from "next/link";

type BreadCrumbsProps = {
  data: Array<{
    name: string;
    url: string;
  }>;
};

export default function BreadCrumbs({ data }: BreadCrumbsProps) {
  return (
    <div className="text-sm breadcrumbs">
      <ul>
        {data.map((item, index) => {
          return (
            <li key={index}>
              <Link 
                className="text-secondary transition duration-75 focus:text-secondary-focus"
                href={item.url}>
                {item.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
