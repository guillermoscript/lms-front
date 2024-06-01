import Footer from '@/components/Footer'
import Header from '@/components/Header'

export default function Layout ({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <>
        {children}
      </>
      <Footer />
    </>
  )
}
