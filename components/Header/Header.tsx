import Image from "next/image";
import ThemeSwitch from "../Inputs/ThemeSwitch";
import Link from "next/link";
import { Nav } from "../Nav";

export default function Header() {
    return (
        <header className="flex justify-between items-center p-2 px-8 bg-accent-content">
            <div className="flex items-center gap-4">
                <Image alt="logo" src="/logo.png" width={50} height={50} />
            </div>
            <div className="flex items-center gap-4">
                <Link 
                    href="/"
                    className="text-2xl font-bold text-secondary">Home</Link>
                <Link 
                    href="/courses"
                    className="text-2xl font-bold text-secondary">Courses</Link>
                <ThemeSwitch />
                <div className="flex items-center justify-center gap-4">
                    <Nav />
                </div>
            </div>
        </header>
    )
}