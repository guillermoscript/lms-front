import { createClient } from "@/lib/supabase/server";
import { CourseCard } from "@/components/public/course-card";
import { Button } from "@/components/ui/button";
import { FilterSidebar } from "@/components/public/filter-sidebar";
import { Search, Grid, List as ListIcon, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";

export default async function CoursesPage() {
    const supabase = await createClient();
    const { data: courses } = await supabase
        .from("courses")
        .select(`
            course_id,
            title,
            description,
            thumbnail_url,
            status,
            created_at
        `)
        .eq("status", "published")
        .order("created_at", { ascending: false });

    return (
        <div className="min-h-screen bg-[#09090b] text-white selection:bg-blue-500/30">
            <div className="container mx-auto py-16 px-4 md:px-8">
                {/* Header Section */}
                <div className="mb-16 space-y-4">
                    <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
                        Educational Courses
                    </h1>
                    <p className="text-zinc-400 text-lg max-w-2xl leading-relaxed">
                        Master the latest technologies and advance your career with our
                        premium, expert-led development tutorials and interactive lessons.
                    </p>
                </div>

                {/* Filter & Toolbar Area */}
                <div className="flex flex-col lg:flex-row gap-12">
                    {/* Left Sidebar - Filters */}
                    <aside className="w-full lg:w-72 flex-shrink-0">
                        <div className="sticky top-8 space-y-8">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold">Filters</h2>
                                <Button variant="link" className="text-blue-400 p-0 h-auto text-sm hover:text-blue-300 font-bold">Clear All</Button>
                            </div>
                            <div className="p-6 bg-zinc-900/40 rounded-2xl border border-zinc-800/50 backdrop-blur-sm">
                                <FilterSidebar />
                            </div>
                        </div>
                    </aside>

                    {/* Main Content - Course Grid */}
                    <div className="flex-1 space-y-10">
                        {/* Top Toolbar */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-zinc-900/40 p-5 rounded-2xl border border-zinc-800/50 backdrop-blur-sm">
                            <div className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                                Showing <span className="text-white font-bold">{courses?.length || 0}</span> published courses
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="hidden sm:flex items-center gap-3 bg-black/40 px-4 py-2 rounded-xl border border-zinc-800/50 group cursor-pointer hover:border-zinc-700 transition-colors">
                                    <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Sort:</span>
                                    <span className="text-sm font-bold text-zinc-200">Latest</span>
                                    <ChevronDown className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                                </div>
                                <div className="h-6 w-px bg-zinc-800/50 mx-1" />
                                <div className="flex items-center gap-1.5 p-1 bg-black/20 rounded-xl border border-zinc-800/50">
                                    <Button size="icon" variant="ghost" className="bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 w-9 h-9 border border-blue-500/20">
                                        <Grid className="w-4.5 h-4.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="text-zinc-500 hover:text-white w-9 h-9">
                                        <ListIcon className="w-4.5 h-4.5" />
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Courses Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                            {courses && courses.length > 0 ? (
                                courses.map((course) => (
                                    <CourseCard key={course.course_id} course={course} />
                                ))
                            ) : (
                                // Fallback/Empty State Skeleton
                                Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="h-[420px] animate-pulse rounded-2xl bg-zinc-900/20 border border-zinc-800/50" />
                                ))
                            )}
                        </div>

                        {courses && courses.length > 0 && (
                            <div className="flex items-center justify-center mt-16 gap-3">
                                <Button variant="outline" className="h-10 border-zinc-800/50 bg-zinc-900/40 text-zinc-400 hover:text-white hover:bg-zinc-800 px-6 rounded-xl transition-all">Previous</Button>
                                <div className="flex items-center gap-2">
                                    {[1, 2, 3].map((p, i) => (
                                        <Button
                                            key={i}
                                            variant={p === 1 ? "default" : "outline"}
                                            className={p === 1
                                                ? "w-10 h-10 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold shadow-lg shadow-blue-600/20"
                                                : "w-10 h-10 border-zinc-800/50 bg-zinc-900/40 text-zinc-400 hover:text-white rounded-xl"}
                                        >
                                            {p}
                                        </Button>
                                    ))}
                                </div>
                                <Button variant="outline" className="h-10 border-zinc-800/50 bg-zinc-900/40 text-zinc-400 hover:text-white hover:bg-zinc-800 px-6 rounded-xl transition-all">Next</Button>
                            </div>
                        )}

                        {(!courses || courses.length === 0) && (
                            <div className="text-center py-32 bg-zinc-900/20 rounded-3xl border border-dashed border-zinc-800/50 flex flex-col items-center gap-6">
                                <div className="p-6 bg-zinc-800/30 rounded-full border border-zinc-700/30">
                                    <Search className="w-12 h-12 text-zinc-600" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-bold text-zinc-300">No courses listed yet</h3>
                                    <p className="text-zinc-500 text-base max-w-sm mx-auto">
                                        We are currently preparing more educational content for you. Please check back later!
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
