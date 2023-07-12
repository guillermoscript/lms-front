import type { AppProps } from 'next/app';

import { AuthProvider } from '../components/Auth';
import { AnimatePresence } from 'framer-motion'
import '../styles/globals.css';
import { QueryClient, QueryClientProvider } from 'react-query';
import { useRouter } from 'next/router';

const queryClient = new QueryClient();

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter()
	const pageKey = router.asPath
  return (
    <AuthProvider>
      <AnimatePresence initial={false} mode="popLayout">
        <QueryClientProvider client={queryClient}>
          {/* <div className={classes.app}>
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
        </div> */}
          <Component {...pageProps} />
        </QueryClientProvider>
      </AnimatePresence>
    </AuthProvider>
  );
}
