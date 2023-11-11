import Link from 'next/link';
import { useRouter } from 'next/router';

export default function AccountMenu() {
  const activeClass = `border-white whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm font-mono`;
  const inactiveClass = `border-transparent text-gray-400 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm font-mono`;

  const router = useRouter();

  return (
    <div className="mt-6 sm:mt-2 2xl:mt-5">
      <div className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <Link
              className={router.pathname === '/dashboard/account' ? activeClass : inactiveClass}
              href="/dashboard/account"
            >
              Perfil
            </Link>
            <Link
              className={router.pathname === '/dashboard/account/my-orders' ? activeClass : inactiveClass}
              href="/dashboard/account/my-orders"
            >
              Ordenes
            </Link>
            <Link
              className={router.pathname === '/dashboard/account/update-profile' ? activeClass : inactiveClass}
              href="/dashboard/account/update-profile"
            >
              Actualizar perfil
            </Link>
            <Link
              className={router.pathname === '/dashboard/account/payment-methods' ? activeClass : inactiveClass}
              href="/dashboard/account/payment-methods"
            >
              Mis métodos de pago
            </Link>
            <Link
              className={router.pathname === '/dashboard/account/my-courses' ? activeClass : inactiveClass}
              href="/dashboard/account/my-courses"
            >
              Mis cursos
            </Link>
            <Link
              className={router.pathname === '/dashboard/account/chat' ? activeClass : inactiveClass}
              href="/dashboard/account/chat"
            >
              Chat
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
