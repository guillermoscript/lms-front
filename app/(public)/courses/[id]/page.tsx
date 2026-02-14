import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
    PlayCircle,
    BookOpen,
    ChevronRight,
    Users,
    Globe,
    Calendar,
    CheckCircle2,
    Clock,
    Infinity,
    Smartphone,
    Award
} from "lucide-react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = 'force-dynamic';

interface Lesson {
    id: number;
    title: string;
    sequence: number;
    description: string | null;
}

interface CourseCategory {
    id: number;
    name: string;
}

interface Course {
    course_id: number;
    title: string;
    description: string | null;
    image_url: string | null;
    author_id: string;
    category_id: number | null;
    status: string;
    published_at: string | null;
    lessons: Lesson[];
    category: CourseCategory | null;
}

export default async function CourseDetailsPage(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const supabase = await createClient();

    // Check if user is logged in
    const { data: { user } } = await supabase.auth.getUser();

    // Fetch course with lessons and category
    const { data: course, error } = await supabase
        .from("courses")
        .select(`
      *,
      lessons (
        id,
        title,
        sequence,
        description
      ),
      category:course_categories (
        id,
        name
      )
    `)
        .eq("course_id", parseInt(params.id))
        .eq("status", "published")
        .single();

    // Fetch author separately since it's in profiles table
    let author = null;
    if (course && !error && course.author_id) {
        const { data: authorData } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url, bio")
            .eq("id", course.author_id)
            .single();
        author = authorData;
    }

    if (error || !course) {
        notFound();
    }

    // Sort lessons by sequence
    const lessons = course.lessons?.sort((a: Lesson, b: Lesson) => a.sequence - b.sequence) || [];
    
    // Count total lessons and calculate estimated duration (assuming 10 min per lesson average)
    const totalLessons = lessons.length;
    const estimatedHours = Math.floor(totalLessons * 10 / 60);
    const estimatedMinutes = (totalLessons * 10) % 60;

    // Check user's access to this course
    let hasAccess = false;

    if (user) {
        const { data: enrollment } = await supabase
            .from('enrollments')
            .select(`
                *,
                subscription:subscriptions!enrollments_subscription_id_fkey (
                    subscription_status,
                    end_date
                )
            `)
            .eq('user_id', user.id)
            .eq('course_id', parseInt(params.id))
            .eq('status', 'active')
            .single();

        if (enrollment) {
            hasAccess = true;
        }
    }

    // Fetch product for this course to check price
    const { data: productCourses } = await supabase
        .from('product_courses')
        .select('product:products(*)')
        .eq('course_id', parseInt(params.id))
        .limit(1);

    const courseProduct = productCourses?.[0]?.product as any;
    const isFree = courseProduct ? parseFloat(courseProduct.price) === 0 : true; // Default to free if no product? or vice-versa?
    // Let's assume if there's no product, it's either part of a plan or free.
    // If there is a product and price is > 0, it's paid.
    const priceDisplay = isFree ? "Free" : `$${courseProduct.price}`;

    // Get instructor info
    const instructor = author ? {
        name: author.full_name || "Instructor",
        avatar_url: author.avatar_url,
        bio: author.bio || "Experienced instructor passionate about teaching."
    } : null;

    // Get learning objectives from lessons descriptions
    const whatYoullLearn = lessons
        .filter((lesson: Lesson) => lesson.description)
        .slice(0, 6)
        .map((lesson: Lesson) => lesson.description);

    return (
        <div className="min-h-screen bg-[#09090b] text-white font-sans">
            {/* Breadcrumbs */}
            <div className="bg-[#18181b]/50 border-b border-zinc-800">
                <div className="container mx-auto px-4 py-3 flex items-center gap-2 text-sm text-zinc-400">
                    <Link href="/" className="hover:text-blue-400 transition-colors">Home</Link>
                    <ChevronRight className="w-3 h-3" />
                    <Link href="/courses" className="hover:text-blue-400 transition-colors">Courses</Link>
                    {course.category && (
                        <>
                            <ChevronRight className="w-3 h-3" />
                            <span className="text-zinc-200 font-medium">{course.category.name}</span>
                        </>
                    )}
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
                            <div className="flex items-center gap-1.5 text-zinc-300">
                                <Users className="w-4 h-4 text-zinc-500" />
                                <span>{totalLessons} lessons</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-zinc-300">
                                <Clock className="w-4 h-4 text-zinc-500" />
                                <span>{estimatedHours}h {estimatedMinutes}m</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-6 text-sm text-zinc-400">
                            {course.published_at && (
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    <span>Published {new Date(course.published_at).toLocaleDateString()}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <Globe className="w-4 h-4" />
                                <span>English</span>
                            </div>
                        </div>

                        {instructor && (
                            <div className="mt-8 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden">
                                    {instructor.avatar_url ? (
                                        <img src={instructor.avatar_url} alt="Instructor" className="w-full h-full object-cover" />
                                    ) : (
                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${instructor.name}`} alt="Instructor" className="w-full h-full object-cover" />
                                    )}
                                </div>
                                <span className="text-zinc-300">Created by <span className="text-blue-400 font-medium">{instructor.name}</span></span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="container mx-auto px-4 py-12">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    {/* Left Column: Course Details */}
                    <div className="lg:col-span-2 space-y-12">

                        {/* What you'll learn */}
                        {whatYoullLearn.length > 0 && (
                            <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8">
                                <h2 className="text-2xl font-bold mb-6">What you&apos;ll learn</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                    {whatYoullLearn.map((item: string | null, i: number) => (
                                        <div key={i} className="flex gap-3">
                                            <div className="mt-1 flex-shrink-0">
                                                <CheckCircle2 className="w-4 h-4 text-blue-400" />
                                            </div>
                                            <span className="text-zinc-300 text-sm leading-relaxed">{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Course Content */}
                        <section>
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold">Course Content</h2>
                            </div>
                            <div className="text-sm text-zinc-400 mb-4 flex gap-3">
                                <span>{lessons.length} lectures</span>
                                <span>•</span>
                                <span>{estimatedHours}h {estimatedMinutes}m total length</span>
                            </div>

                            {lessons.length > 0 ? (
                                <Accordion className="w-full space-y-3">
                                    <AccordionItem value="lessons" className="border border-zinc-800 bg-zinc-900/30 rounded-lg px-4 overflow-hidden">
                                        <AccordionTrigger className="hover:no-underline py-4">
                                            <div className="flex items-center gap-4 text-left">
                                                <span className="font-bold text-white">All Lessons</span>
                                                <span className="text-xs text-zinc-500 font-normal">{lessons.length} lectures</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="pb-4 space-y-2">
                                            {lessons.map((lesson: Lesson) => (
                                                <div key={lesson.id} className="flex items-center justify-between p-3 rounded-md hover:bg-zinc-800/50 group cursor-pointer transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <BookOpen className="w-4 h-4 text-zinc-500 group-hover:text-blue-400" />
                                                        <span className="text-sm text-zinc-300 group-hover:text-white">{lesson.title}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            ) : (
                                <div className="text-center py-8 text-zinc-500">
                                    No lessons available yet.
                                </div>
                            )}
                        </section>

                        {/* Description */}
                        {course.description && (
                            <section className="space-y-6">
                                <h2 className="text-2xl font-bold">About This Course</h2>
                                <div className="prose prose-invert max-w-none text-zinc-400 text-base leading-relaxed">
                                    <p>{course.description}</p>
                                </div>
                            </section>
                        )}

                        {/* Instructor Info */}
                        {instructor && (
                            <section>
                                <h2 className="text-2xl font-bold mb-8">Instructor</h2>
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-24 h-24 rounded-full bg-zinc-700 overflow-hidden ring-4 ring-zinc-800">
                                            {instructor.avatar_url ? (
                                                <img src={instructor.avatar_url} alt="Instructor" className="w-full h-full object-cover" />
                                            ) : (
                                                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${instructor.name}`} alt="Instructor" className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-xl font-bold text-white">{instructor.name}</div>
                                            <div className="text-zinc-400 mt-2">Experienced Instructor</div>
                                        </div>
                                    </div>
                                    {instructor.bio && (
                                        <p className="text-zinc-400 leading-relaxed">
                                            {instructor.bio}
                                        </p>
                                    )}
                                </div>
                            </section>
                        )}
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
                                    <div className="flex items-center justify-between">
                                        <div className="text-3xl font-bold text-white">{priceDisplay}</div>
                                        {courseProduct?.currency && (
                                            <div className="text-zinc-500 uppercase">{courseProduct.currency}</div>
                                        )}
                                    </div>
                                    
                                    <div className="space-y-3">
                                        {!user ? (
                                            // Not logged in - redirect to login
                                            <Link href={`/auth/login?next=${encodeURIComponent(`/courses/${params.id}`)}`}>
                                                <Button className="w-full h-12 bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-lg shadow-lg shadow-cyan-400/20">
                                                    {isFree ? "Enroll for Free" : "Enroll Now"}
                                                </Button>
                                            </Link>
                                        ) : hasAccess ? (
                                            // Has access - go to course
                                            <Link href={`/dashboard/student/courses/${course.course_id}`}>
                                                <Button className="w-full h-12 bg-green-500 hover:bg-green-600 text-white font-bold text-lg">
                                                    Go to Course
                                                </Button>
                                            </Link>
                                        ) : isFree ? (
                                            // Logged in, no access, but it's free
                                            <Link href={`/checkout?courseId=${course.course_id}`}>
                                                <Button className="w-full h-12 bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-lg shadow-lg shadow-cyan-400/20">
                                                    Enroll for Free
                                                </Button>
                                            </Link>
                                        ) : (
                                            // Logged in but no access - buy now
                                            <Link href={`/checkout?courseId=${course.course_id}`}>
                                                <Button className="w-full h-12 bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-lg shadow-lg shadow-cyan-400/20">
                                                    Buy Now
                                                </Button>
                                            </Link>
                                        )}
                                        
                                        {!hasAccess && !isFree && (
                                            <div className="text-center">
                                                <span className="text-zinc-500 text-xs">or</span>
                                                <Link href="/pricing" className="block text-cyan-400 hover:underline text-sm mt-1">
                                                    Get access via Subscription
                                                </Link>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-4 border-t border-zinc-800 pt-6">
                                        <div className="font-bold text-sm">This course includes:</div>
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-3 text-sm text-zinc-300">
                                                <BookOpen className="w-4 h-4 text-zinc-500" />
                                                <span>{totalLessons} lessons</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-zinc-300">
                                                <Clock className="w-4 h-4 text-zinc-500" />
                                                <span>{estimatedHours}h {estimatedMinutes}m of content</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-zinc-300">
                                                <Infinity className="w-4 h-4 text-zinc-500" />
                                                <span>Full lifetime access</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-zinc-300">
                                                <Smartphone className="w-4 h-4 text-zinc-500" />
                                                <span>Access on mobile and desktop</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm text-zinc-300">
                                                <Award className="w-4 h-4 text-zinc-500" />
                                                <span>Certificate of completion</span>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
