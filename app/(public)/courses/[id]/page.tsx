import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
    Lock,
    PlayCircle,
    BookOpen,
    ChevronRight,
    Star,
    Users,
    Globe,
    Calendar,
    CheckCircle2,
    Clock,
    FileText,
    Download,
    Infinity,
    Smartphone,
    Award,
    Share2,
    Heart
} from "lucide-react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";

export default async function CourseDetailsPage(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const supabase = await createClient();

    const { data: course, error } = await supabase
        .from("courses")
        .select(`
      *,
      lessons (
        id,
        title,
        sequence,
        is_free,
        duration
      )
    `)
        .eq("id", params.id)
        .single();

    if (error || !course) {
        notFound();
    }

    // Sort lessons by sequence
    const lessons = course.lessons?.sort((a: any, b: any) => a.sequence - b.sequence) || [];

    // Mock additional data for UI completeness
    const instructor = {
        name: "Alex Johnson",
        title: "Senior Frontend Engineer @ TechCorp",
        rating: 4.8,
        reviews: "54,210",
        students: "12,450",
        courses: 12,
        bio: "Alex is a Senior Frontend Engineer with over 10 years of experience building scalable web applications. He specializes in React ecosystem and has contributed to several open-source libraries. His teaching style focuses on practical, real-world examples that you can apply immediately to your work."
    };

    const whatYoullLearn = [
        "Understand Higher Order Components and when to use them effectively.",
        "Implement Server-Side Rendering (SSR) with Next.js.",
        "Optimize React performance using memoization and code splitting.",
        "Master Redux Toolkit for complex state management scenarios.",
        "Build custom hooks to abstract component logic.",
        "Write comprehensive unit and integration tests with React Testing Library."
    ];

    return (
        <div className="min-h-screen bg-[#09090b] text-white font-sans">
            {/* Breadcrumbs */}
            <div className="bg-[#18181b]/50 border-b border-zinc-800">
                <div className="container mx-auto px-4 py-3 flex items-center gap-2 text-sm text-zinc-400">
                    <Link href="/" className="hover:text-blue-400 transition-colors">Home</Link>
                    <ChevronRight className="w-3 h-3" />
                    <Link href="/courses" className="hover:text-blue-400 transition-colors">Development</Link>
                    <ChevronRight className="w-3 h-3" />
                    <span className="text-zinc-200 font-medium">Web Development</span>
                    <ChevronRight className="w-3 h-3" />
                    <span className="text-blue-400">{course.title}</span>
                </div>
            </div>

            {/* Hero Section */}
            <div className="bg-[#18181b] border-b border-zinc-800 py-12 lg:py-16">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl">
                        <h1 className="text-4xl lg:text-5xl font-bold mb-6 tracking-tight leading-tight">
                            {course.title}
                        </h1>
                        <p className="text-xl text-zinc-400 mb-8 leading-relaxed max-w-3xl">
                            {course.description || "Master advanced patterns, performance optimization, and state management techniques to build scalable React applications."}
                        </p>

                        <div className="flex flex-wrap items-center gap-6 text-sm mb-8">
                            <div className="flex items-center gap-1.5 text-yellow-500 font-bold">
                                <span>4.8</span>
                                <div className="flex">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                        <Star key={s} className={`w-3.5 h-3.5 fill-current ${s === 5 ? 'opacity-30' : ''}`} />
                                    ))}
                                </div>
                                <span className="text-blue-400 font-medium ml-1 underline underline-offset-4 cursor-pointer">(1,200 ratings)</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-zinc-300">
                                <Users className="w-4 h-4 text-zinc-500" />
                                <span>12,450 students</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-6 text-sm text-zinc-400">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                <span>Last updated 10/2023</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Globe className="w-4 h-4" />
                                <span>English</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                <span>English [Auto], Spanish</span>
                            </div>
                        </div>

                        <div className="mt-8 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden">
                                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alex" alt="Instructor" className="w-full h-full object-cover" />
                            </div>
                            <span className="text-zinc-300">Created by <Link href="#" className="text-blue-400 underline underline-offset-4 font-medium">{instructor.name}</Link></span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="container mx-auto px-4 py-12">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    {/* Left Column: Course Details */}
                    <div className="lg:col-span-2 space-y-12">

                        {/* What you'll learn */}
                        <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8">
                            <h2 className="text-2xl font-bold mb-6">What you'll learn</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                {whatYoullLearn.map((item, i) => (
                                    <div key={i} className="flex gap-3">
                                        <div className="mt-1 flex-shrink-0">
                                            <CheckCircle2 className="w-4 h-4 text-blue-400" />
                                        </div>
                                        <span className="text-zinc-300 text-sm leading-relaxed">{item}</span>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Course Content */}
                        <section>
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold">Course Content</h2>
                                <button className="text-blue-400 text-sm font-medium hover:underline">Expand all sections</button>
                            </div>
                            <div className="text-sm text-zinc-400 mb-4 flex gap-3">
                                <span>5 sections</span>
                                <span>•</span>
                                <span>{lessons.length} lectures</span>
                                <span>•</span>
                                <span>15h 30m total length</span>
                            </div>

                            <Accordion className="w-full space-y-3">
                                <AccordionItem value="section-1" className="border border-zinc-800 bg-zinc-900/30 rounded-lg px-4 overflow-hidden">
                                    <AccordionTrigger className="hover:no-underline py-4">
                                        <div className="flex items-center gap-4 text-left">
                                            <span className="font-bold text-white">Introduction to Advanced Patterns</span>
                                            <span className="text-xs text-zinc-500 font-normal">3 lectures • 15min</span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pb-4 space-y-2">
                                        {lessons.map((lesson: any, idx: number) => (
                                            <div key={lesson.id} className="flex items-center justify-between p-3 rounded-md hover:bg-zinc-800/50 group cursor-pointer transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <PlayCircle className="w-4 h-4 text-zinc-500 group-hover:text-blue-400" />
                                                    <span className="text-sm text-zinc-300 group-hover:text-white">{lesson.title}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    {lesson.is_free && <span className="text-xs text-blue-400 font-medium underline">Preview</span>}
                                                    <span className="text-xs text-zinc-500 font-mono">05:20</span>
                                                </div>
                                            </div>
                                        ))}
                                    </AccordionContent>
                                </AccordionItem>

                                <AccordionItem value="section-2" className="border border-zinc-800 bg-zinc-900/30 rounded-lg px-4">
                                    <AccordionTrigger className="hover:no-underline py-4">
                                        <div className="flex items-center gap-4 text-left">
                                            <span className="font-bold text-white">Component Composition</span>
                                            <span className="text-xs text-zinc-500 font-normal">12 lectures • 2hr 10m</span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pb-4 text-zinc-500 text-sm italic">
                                        Content locked for preview...
                                    </AccordionContent>
                                </AccordionItem>

                                <AccordionItem value="section-3" className="border border-zinc-800 bg-zinc-900/30 rounded-lg px-4">
                                    <AccordionTrigger className="hover:no-underline py-4">
                                        <div className="flex items-center gap-4 text-left">
                                            <span className="font-bold text-white">State Management at Scale</span>
                                            <span className="text-xs text-zinc-500 font-normal">9 lectures • 3hr 45m</span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pb-4 text-zinc-500 text-sm italic">
                                        Content locked for preview...
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </section>

                        {/* Description */}
                        <section className="space-y-6">
                            <h2 className="text-2xl font-bold">Description</h2>
                            <div className="prose prose-invert max-w-none text-zinc-400 text-base leading-relaxed space-y-4">
                                <p>
                                    React is the most popular library for building user interfaces today, but mastering it requires more than just knowing the basics. In this comprehensive course, we dive deep into the patterns and practices used by top engineering teams at companies like Meta, Netflix, and Airbnb.
                                </p>
                                <p>
                                    You will go beyond simple tutorials and build a production-ready application that handles complex state, routing, and data fetching requirements. We will explore how to write clean, maintainable code using the latest features of React 18+.
                                </p>
                                <div className="font-bold text-zinc-200 mt-6">Key topics covered:</div>
                                <ul className="list-disc pl-5 space-y-2 mt-2">
                                    <li>Advanced Hooks patterns (useLayoutEffect, useImperativeHandle)</li>
                                    <li>Performance profiling and optimization</li>
                                    <li>Custom Design Systems with React</li>
                                    <li>Accessibility (a11y) best practices</li>
                                </ul>
                            </div>
                        </section>

                        {/* Instructor Info */}
                        <section>
                            <h2 className="text-2xl font-bold mb-8">Instructor</h2>
                            <div className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-24 h-24 rounded-full bg-zinc-700 overflow-hidden ring-4 ring-zinc-800">
                                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alex" alt="Instructor" className="w-full h-full object-cover" />
                                    </div>
                                    <div>
                                        <Link href="#" className="text-xl font-bold text-blue-400 hover:underline">{instructor.name}</Link>
                                        <div className="text-zinc-400">{instructor.title}</div>
                                        <div className="flex items-center gap-4 mt-2 text-sm">
                                            <div className="flex items-center gap-1.5"><Star className="w-4 h-4 text-yellow-500 fill-current" /> <span className="text-zinc-200 font-bold">4.8 Rating</span></div>
                                            <div className="flex items-center gap-1.5"><Users className="w-4 h-4 text-zinc-500" /> <span className="text-zinc-200 font-bold">54,210 Students</span></div>
                                            <div className="flex items-center gap-1.5"><PlayCircle className="w-4 h-4 text-zinc-500" /> <span className="text-zinc-200 font-bold">{instructor.courses} Courses</span></div>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-zinc-400 leading-relaxed italic">
                                    "{instructor.bio}"
                                </p>
                            </div>
                        </section>
                    </div>

                    {/* Right Column: Sticky Pricing Card */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-8 space-y-6">
                            <Card className="bg-[#18181b] border-zinc-800 shadow-2xl overflow-hidden">
                                <div className="relative aspect-video group cursor-pointer">
                                    <img
                                        src={course.image_url || "https://images.unsplash.com/photo-1633356122544-f134324a6cee?q=80&w=2070&auto=format&fit=crop"}
                                        alt="Thumbnail"
                                        className="w-full h-full object-cover brightness-50 group-hover:brightness-75 transition-all"
                                    />
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <PlayCircle className="w-16 h-16 text-white group-hover:scale-110 transition-transform" />
                                        <span className="mt-4 font-bold text-white">Preview this course</span>
                                    </div>
                                </div>

                                <CardContent className="p-6 space-y-6">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <span className="text-4xl font-bold">${course.price || "12.99"}</span>
                                            <span className="text-zinc-500 line-through text-lg">${course.price ? (course.price * 1.5).toFixed(2) : "84.99"}</span>
                                            <span className="text-sm font-bold text-cyan-400">85% off</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-rose-400 text-sm font-medium animate-pulse">
                                            <Clock className="w-4 h-4" />
                                            <span>2 days left at this price!</span>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <Link href={`/checkout?courseId=${course.id}`}>
                                            <Button className="w-full h-12 bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-lg shadow-lg shadow-cyan-400/20">
                                                Buy Now
                                            </Button>
                                        </Link>
                                        <Button variant="outline" className="w-full h-12 border-zinc-700 bg-transparent hover:bg-zinc-800 text-white font-bold">
                                            Add to Cart
                                        </Button>
                                    </div>

                                    <div className="text-center text-xs text-zinc-500">
                                        30-Day Money-Back Guarantee
                                    </div>

                                    <div className="space-y-4">
                                        <div className="font-bold text-sm">This course includes:</div>
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-3 text-sm text-zinc-300">
                                                <PlayCircle className="w-4 h-4 text-zinc-500" />
                                                <span>15.5 hours on-demand video</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-zinc-300">
                                                <FileText className="w-4 h-4 text-zinc-500" />
                                                <span>4 articles</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-zinc-300">
                                                <Download className="w-4 h-4 text-zinc-500" />
                                                <span>12 downloadable resources</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-zinc-300">
                                                <Infinity className="w-4 h-4 text-zinc-500" />
                                                <span>Full lifetime access</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-zinc-300">
                                                <Smartphone className="w-4 h-4 text-zinc-500" />
                                                <span>Access on mobile and TV</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-zinc-300">
                                                <Award className="w-4 h-4 text-zinc-500" />
                                                <span>Certificate of completion</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between border-t border-zinc-800 pt-6">
                                        <button className="flex items-center gap-2 text-sm font-bold text-white hover:text-blue-400 transition-colors">
                                            <Share2 className="w-4 h-4" /> Share
                                        </button>
                                        <button className="flex items-center gap-2 text-sm font-bold text-white hover:text-blue-400 transition-colors">
                                            Gift this course
                                        </button>
                                        <button className="flex items-center gap-2 text-sm font-bold text-white hover:text-blue-400 transition-colors">
                                            Apply Coupon
                                        </button>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Additional Info Box */}
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
                                <h3 className="font-bold">Training 5 or more people?</h3>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Get your team access to 8,000+ top courses anytime, anywhere.
                                </p>
                                <Button variant="outline" className="w-full border-zinc-700 hover:bg-zinc-800 text-white font-bold">
                                    Try LMS Business
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
