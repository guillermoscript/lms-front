import type { AppProps } from 'next/app';
import Link from 'next/link';
import { AuthProvider } from '../components/Auth';
import { Logo } from '../components/Logo';
import { Nav } from '../components/Nav';
import classes from './app.module.css';

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <div className={classes.app}>
        <div className={classes.header}>
          <div className={classes.logo}>
            <Link href="/">
              <a>
                <Logo />
              </a>
            </Link>
          </div>
          <Nav />
        </div>
        <Component {...pageProps} />
      </div>
    </AuthProvider>
  );
}
