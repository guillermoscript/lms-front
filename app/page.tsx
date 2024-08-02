import Footer from '@/components/Footer'
import Header from '@/components/Header'
import { FeaturesSection } from '@/components/home/FeaturesSection'
import HeroSection from '@/components/home/HeroSection'
import OptionsSection from '@/components/home/OptionsSection'
import ParticlesSection from '@/components/home/ParticlesSection'
import WaitingList from '@/components/home/WaitingList'

export default async function Index() {
    return (
        <>
            <Header />
            <div className="max-w-7xl mx-auto px-4 flex flex-col items-center justify-between">
                <ParticlesSection>
                    <HeroSection />
                </ParticlesSection>
                <FeaturesSection />
                <OptionsSection />
                <WaitingList />
            </div>
            <Footer />
        </>
    )
}
