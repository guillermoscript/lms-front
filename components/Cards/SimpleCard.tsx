import Image from 'next/image';
import Link from 'next/link';

type SimpleCardProps = {
  id: string;
  title: string;
  action: React.ReactNode;
  description: string;
  imgUrl: string;
  imageAlt: string;
};

export default function SimpleCard({ id, title, action, description, imgUrl, imageAlt }: SimpleCardProps) {
  return (
    <div className="card card-compact w-96 bg-base-100 shadow-xl">
      <figure>
        <Image src={imgUrl} alt={imageAlt} width={300} height={300} className="rounded-t-lg" />
      </figure>
      <div className="card-body">
        <h2 className="card-title">{title}</h2>
        <p>{description}</p>
        <div className="card-actions justify-end">
          {action}
        </div>
      </div>
    </div>
  );
}
