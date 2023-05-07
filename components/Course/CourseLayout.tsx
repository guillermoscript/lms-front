import Footer from "../Footer/Footer";
import Header from "../Header/Header";

export default function CourseLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <Header />
            <main className="bg-base-200 px-10 py-16 mx-auto lg:px-20 max-lg:px-40 max-lg:max-w-4xl">
                {children}
            </main>
            <Footer />
        </>
    );
}