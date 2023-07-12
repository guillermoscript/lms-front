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
            <Link href="/dashboard/account">
              <a className={router.pathname === '/dashboard/account' ? activeClass : inactiveClass}>Perfil</a>
            </Link>
            <Link href="/dashboard/account/my-orders">
              <a className={router.pathname === '/dashboard/account/my-orders' ? activeClass : inactiveClass}>Ordenes</a>
            </Link>
            <Link href="/dashboard/account/update-profile">
              <a className={router.pathname === '/dashboard/account/update-profile' ? activeClass : inactiveClass}>
                Actualizar perfil
              </a>
            </Link>
            <Link href="/dashboard/account/payment-methods">
              <a className={router.pathname === '/dashboard/account/payment-methods' ? activeClass : inactiveClass}>
                Mis métodos de pago
              </a>
            </Link>
            <Link href="/dashboard/account/my-courses">
              <a className={router.pathname === '/dashboard/account/my-courses' ? activeClass : inactiveClass}>
                Mis cursos
              </a>
            </Link>
            <Link href="/dashboard/account/chat">
              <a className={router.pathname === '/dashboard/account/chat' ? activeClass : inactiveClass}>
                Chat
              </a>
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
