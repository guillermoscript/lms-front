import HeroVideoDialogDemoTopInBottomOut from '@/components/example/hero-video-dialog-demo-top-in-bottom-out'
import { RetroGridDemo } from '@/components/example/RetroGridDemo'
import Footer from '@/components/Footer'
import Header from '@/components/Header'
import ChatOptionsShowcase from '@/components/home/ChatOptionsShowCase'
import { FeaturesSection } from '@/components/home/FeaturesSection'
import GeminiHeroSection from '@/components/home/GeminiCompetition'
import OptionsSection from '@/components/home/OptionsSection'
import ParticlesSection from '@/components/home/ParticlesSection'
import WaitingList from '@/components/home/WaitingList'

export const maxDuration = 30

export default async function Index() {
    return (
        <>
            <Header />
            <div className="max-w-7xl mx-auto px-4 flex flex-col items-center justify-between">
                <ParticlesSection>
                    <HeroVideoDialogDemoTopInBottomOut />
                </ParticlesSection>
                <ChatOptionsShowcase />
                <FeaturesSection />
                <GeminiHeroSection />
                <OptionsSection />
                <WaitingList />
            </div>
            <div className="w-full ">
                <RetroGridDemo />
            </div>
            <Footer />
        </>
    )
}
