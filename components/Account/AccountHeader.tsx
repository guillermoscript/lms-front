import Image from "next/image";
import { Media, User } from "../../payload-types";

type AccountHeaderProps = {
    user: User
};

export default function AccountHeader({ user }: AccountHeaderProps) {
  return (
    <div>
      <div
        className="h-48 w-full lg:h-64 
          bg-gradient-to-l from-primary via-purple-300 to-accent"
      ></div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 sm:-mt-16 sm:flex sm:items-end sm:space-x-5">
        <div className="relative group h-24 w-24 rounded-full overflow-hidden sm:h-32 sm:w-32">
          {
            user.photo ? (
              <Image alt="Marcus Dicki" src={(user.photo as Media).url || "/images/home/home2.jpg"} width="300" height="300" />
            ) : (
              <Image alt="Marcus Dicki" src="/images/home/home2.jpg" width="300" height="300" />
            )
          }
        </div>
        <div className="mt-6 sm:flex-1 sm:min-w-0 sm:flex sm:items-center sm:justify-end sm:space-x-6 sm:pb-1">
          <div className="flex min-w-0 flex-1 items-center space-x-2">
            <h1 className="text-2xl font-semibold  truncate">{user.firstName} {user.lastName}</h1>
          </div>
          {/* <div className="mt-6 flex flex-col justify-stretch space-y-3 sm:flex-row sm:space-y-0 sm:space-x-4">
            <a
              href="https://github.com/vercel/mongodb-starter"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex justify-center px-4 py-2 border border-gray-800 hover:border-white shadow-sm text-sm font-medium rounded-md  font-mono bg-black focus:outline-none focus:ring-0 transition-all"
            >
              <span>Something Special</span>
            </a>
          </div> */}
        </div>
      </div>
    </div>
  );
}
