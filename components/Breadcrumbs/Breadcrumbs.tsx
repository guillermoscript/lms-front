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
                href={item.url}>
                <a className="text-secondary transition duration-75 focus:text-secondary-focus">{item.name}</a>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
