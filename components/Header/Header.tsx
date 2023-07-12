import Link from 'next/link';
import ThemeSwitch from '../Inputs/ThemeSwitch';
import { Nav } from '../Nav';

export default function Header() {
  return (
    <div className="navbar bg-base-100">
      <div className="flex-1">
        <Link href="/">
          <a className="btn btn-ghost normal-case text-xl">LMS</a>
        </Link>
      </div>
      <div className="flex-none">
        <ul className="menu menu-horizontal items-center px-1">
          <li>
            <ThemeSwitch />
          </li>
          <li>
            <details>
              <summary>Menu</summary>
              <Nav />
            </details>
          </li>
        </ul>
      </div>
    </div>
  );
}
