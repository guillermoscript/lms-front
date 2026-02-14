import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Zap, Code2, Users, Terminal, Database, Shield } from "lucide-react";
import { VideoPlayerMock } from "@/components/public/video-player-mock";
import { Badge } from "@/components/ui/badge";

export default async function LandingPage() {
    return (
        <div className="flex flex-col min-h-screen bg-[#0A0A0A] overflow-hidden selection:bg-blue-500/30">

            {/* Hero Section */}
            <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-32 overflow-hidden">
                {/* Subtle Background Glow */}
                <div className="absolute top-0 right-0 w-[800px] h-[600px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none -translate-y-1/2 translate-x-1/2" />

                <div className="container mx-auto px-4 md:px-6 relative z-10">
                    <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-center">

                        {/* Left Column: Text */}
                        <div className="flex flex-col items-start space-y-8">
                            <Badge variant="secondary" className="bg-blue-900/20 text-blue-400 border-blue-800/50 hover:bg-blue-900/30 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide uppercase">
                                <span className="mr-2">⚡</span> Powered by Next.js 16
                            </Badge>

                            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-white leading-[1.1]">
                                Master Your <br />
                                Future with <br />
                                <span className="text-zinc-500">LMS V2</span>
                            </h1>

                            <p className="text-lg text-zinc-400 max-w-xl leading-relaxed">
                                The ultimate learning platform powered by Next.js 16 and Supabase.
                                Interactive, fast, and scalable for modern developers.
                            </p>

                            <div className="flex flex-wrap gap-4 pt-2">
                                <Link href="/auth/sign-up">
                                    <Button size="lg" className="h-12 px-8 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-base shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.45)] transition-shadow">
                                        Get Started Free
                                    </Button>
                                </Link>
                                <Link href="https://github.com/guillermoscript/lms-front" target="_blank">
                                    <Button size="lg" variant="outline" className="h-12 px-8 bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg text-base">
                                        View Github <ArrowUpRight className="ml-2 w-4 h-4" />
                                    </Button>
                                </Link>
                            </div>

                            {/* Trusted By */}
                            <div className="pt-8 flex flex-col gap-4">
                                <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Trusted by developers at</p>
                                <div className="flex gap-6 opacity-40 grayscale transition-all duration-500 hover:grayscale-0 hover:opacity-100">
                                    <Terminal className="w-6 h-6 text-white" />
                                    <Database className="w-6 h-6 text-white" />
                                    <Code2 className="w-6 h-6 text-white" />
                                    <Shield className="w-6 h-6 text-white" />
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Visual Mock */}
                        <div className="relative w-full max-w-xl lg:max-w-none mx-auto">
                            <div className="relative z-10">
                                <VideoPlayerMock />
                            </div>

                            {/* Decorative elements behind video */}
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000 -z-10"></div>
                        </div>

                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-32 relative bg-[#0A0A0A] border-t border-white/5">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
                        <h2 className="text-3xl font-bold text-white">Why Choose LMS V2?</h2>
                        <p className="text-zinc-400">
                            Built for performance and developer experience. We focus on the features that matter for technical education.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Card 1 */}
                        <div className="bg-zinc-900/30 border border-white/5 p-8 rounded-2xl hover:bg-zinc-900/50 hover:border-white/10 transition duration-300">
                            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mb-6">
                                <Zap className="w-6 h-6 text-blue-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">AI-Powered Feedback</h3>
                            <p className="text-zinc-400 text-sm leading-relaxed">
                                Get instant, intelligent code reviews and suggestions on your assignments powered by the latest LLMs.
                            </p>
                        </div>

                        {/* Card 2 */}
                        <div className="bg-zinc-900/30 border border-white/5 p-8 rounded-2xl hover:bg-zinc-900/50 hover:border-white/10 transition duration-300">
                            <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center mb-6">
                                <Code2 className="w-6 h-6 text-purple-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">MDX Lesson Support</h3>
                            <p className="text-zinc-400 text-sm leading-relaxed">
                                Write interactive lessons with MDX. Embed React components directly inside your course content securely.
                            </p>
                        </div>

                        {/* Card 3 */}
                        <div className="bg-zinc-900/30 border border-white/5 p-8 rounded-2xl hover:bg-zinc-900/50 hover:border-white/10 transition duration-300">
                            <div className="w-12 h-12 bg-pink-500/10 rounded-lg flex items-center justify-center mb-6">
                                <Users className="w-6 h-6 text-pink-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Role-Based Dashboards</h3>
                            <p className="text-zinc-400 text-sm leading-relaxed">
                                Dedicated interfaces for Students, Instructors, and Admins to manage progress, content, and analytics.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

        </div>
    );
}
