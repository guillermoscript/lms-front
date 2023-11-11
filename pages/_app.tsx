import type { AppProps } from 'next/app';

// import { AuthProvider } from '../components/Auth';
import { AuthProvider } from '@/providers/Auth/index';
import { AnimatePresence } from 'framer-motion'
import '../styles/globals.css';
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { useRouter } from 'next/router';
import { Toaster } from '@/components/ui/toaster';

const queryClient = new QueryClient();

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter()
	const pageKey = router.asPath
  return (
    <AuthProvider
			// To toggle between the REST and GraphQL APIs,
			// change the `api` prop to either `rest` or `gql`
			api="rest" // change this to `gql` to use the GraphQL API
		>
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
          <Toaster />
        </QueryClientProvider>
      </AnimatePresence>
    </AuthProvider>
  );
}
