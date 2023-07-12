import Image from 'next/image';
import Link from 'next/link';

type CoursesCardsProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  title: string;
  description: string;
  action: React.ReactNode;
};

export default function CoursesCards({ src, alt, width, height, title, description, action }: CoursesCardsProps) {
  return (
        <div className="card card-compact bg-base-100 shadow-xl">
      <figure>
        <Image 
          width={width}
          height={height}
          src={src}
          alt={alt}
          objectFit='cover'
          className="rounded-t-lg" />
      </figure>
      <div className="card-body">
        <Link href="/course/[id]" as={`/course/${title}`}>
          <a className="card-title">{title}</a>
        </Link>
        <p>{description}</p>
        {action}
      </div>
    </div>
  );
}
