import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Zap,
  Code2,
  Users,
  Star,
  Shield,
  Rocket,
  GraduationCap,
  Gem,
  CheckCircle2,
  Brain,
  Trophy,
  Flame,
  BarChart3,
  Globe2,
  CreditCard,
  Bell,
  FileText,
  Layers,
  Lock,
  Sparkles,
  TrendingUp,
  Award,
  BookOpen,
  Play,
  MessageSquare,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function LandingPage() {
  const t = await getTranslations("landing");

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0A] overflow-hidden selection:bg-blue-500/30">
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10" aria-hidden="true">
        <div className="absolute top-[-10%] right-[-10%] w-[700px] h-[700px] bg-blue-500/8 rounded-full blur-[140px]" />
        <div className="absolute bottom-[30%] left-[-10%] w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-5%] right-[20%] w-[400px] h-[400px] bg-emerald-500/4 rounded-full blur-[100px]" />
      </div>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-36" aria-label="Hero">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="flex flex-col items-center text-center max-w-5xl mx-auto space-y-8">
            <Badge
              variant="secondary"
              className="bg-blue-900/20 text-blue-400 border-blue-800/50 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide uppercase flex items-center gap-2"
            >
              <Zap className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              White-Label LMS SaaS Platform
            </Badge>

            <h1 className="text-6xl lg:text-8xl font-black tracking-tight text-white leading-[1.05] bg-clip-text text-transparent bg-gradient-to-b from-white via-zinc-200 to-zinc-500"
              style={{ textWrap: "balance" }}>
              Launch Your Online Academy in&nbsp;
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                Minutes
              </span>
            </h1>

            <p className="text-xl text-zinc-400 max-w-2xl leading-relaxed font-medium" style={{ textWrap: "pretty" }}>
              The complete platform to create, sell, and scale your online courses.
              AI grading, gamification, Stripe payments, and multi-tenant isolation —
              all out of the box.
            </p>

            <div className="flex flex-wrap gap-4 justify-center pt-2">
              <Link href="/create-school">
                <Button
                  size="lg"
                  className="h-14 px-10 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-lg shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:shadow-[0_0_45px_rgba(37,99,235,0.45)] transition-[box-shadow,background-color] duration-200 active:scale-95"
                >
                  Start Your School Free
                  <ArrowRight className="ml-2 w-5 h-5" aria-hidden="true" />
                </Button>
              </Link>
              <Link href="/courses">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 px-10 bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800/80 rounded-xl text-lg backdrop-blur-sm transition-[background-color,color] duration-200"
                >
                  Browse Courses
                </Button>
              </Link>
            </div>

            {/* Social proof */}
            <div className="flex flex-wrap items-center justify-center gap-8 pt-6 border-t border-white/5 w-full">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-3" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="w-9 h-9 rounded-full border-2 border-[#0A0A0A] bg-zinc-800 overflow-hidden ring-1 ring-zinc-700">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=user${i}`} alt="" width={36} height={36} loading="lazy" />
                    </div>
                  ))}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-0.5" aria-label="5 out of 5 stars">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" aria-hidden="true" />
                    ))}
                  </div>
                  <p className="text-zinc-400 text-xs font-medium">10,000+ active students</p>
                </div>
              </div>
              <div className="h-8 w-px bg-zinc-800" aria-hidden="true" />
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                <span>Free plan available</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                <span>Your own subdomain</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ────────────────────────────────────────── */}
      <section className="py-14 border-y border-white/5 bg-zinc-900/20 backdrop-blur-sm" aria-label="Platform statistics">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 justify-items-center">
            {[
              { value: "10k+", label: "Active Students" },
              { value: "500+", label: "Courses Published" },
              { value: "50+", label: "Schools Running" },
              { value: "4.9/5", label: "Average Rating" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-black text-white mb-1 tabular-nums">{stat.value}</div>
                <div className="text-sm text-zinc-500 font-medium tracking-wide uppercase">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── For Whom ─────────────────────────────────────────── */}
      <section className="py-28 relative" aria-label="Who this platform is for">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <Badge variant="outline" className="border-zinc-800 text-zinc-400 rounded-full px-4 py-1">
              One platform, two experiences
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight" style={{ textWrap: "balance" }}>
              Built for Schools and Students
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* Schools */}
            <div className="bg-gradient-to-br from-blue-900/20 to-blue-900/5 border border-blue-800/30 rounded-3xl p-8 space-y-6">
              <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
                <GraduationCap className="w-6 h-6 text-blue-400" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Course Creators & Schools</h3>
                <p className="text-zinc-400 leading-relaxed">
                  Launch your branded online academy in minutes. Create courses, set pricing, accept payments, and watch your students grow — all from one dashboard.
                </p>
              </div>
              <ul className="space-y-2" role="list">
                {[
                  "Your own subdomain (yourschool.platform.com)",
                  "Custom branding, logo & colors",
                  "Stripe Connect — payments go directly to you",
                  "AI-powered exam grading & exercises",
                  "Full student analytics & progress tracking",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-zinc-300">
                    <CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/create-school">
                <Button className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors duration-200">
                  Create Your School
                  <ArrowRight className="ml-2 w-4 h-4" aria-hidden="true" />
                </Button>
              </Link>
            </div>

            {/* Students */}
            <div className="bg-gradient-to-br from-purple-900/20 to-purple-900/5 border border-purple-800/30 rounded-3xl p-8 space-y-6">
              <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/20">
                <BookOpen className="w-6 h-6 text-purple-400" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Learners</h3>
                <p className="text-zinc-400 leading-relaxed">
                  Learn at your pace with structured courses, video lessons, and AI-guided exercises. Earn XP, climb the leaderboard, and prove your skills with verifiable certificates.
                </p>
              </div>
              <ul className="space-y-2" role="list">
                {[
                  "Progress tracking across all enrolled courses",
                  "AI tutor helps you through exercises in real time",
                  "Gamification: XP, levels, streaks & achievements",
                  "Downloadable certificates verified via QR code",
                  "MDX content with code blocks & interactive demos",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-zinc-300">
                    <CheckCircle2 className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/courses">
                <Button variant="outline" className="border-purple-800/50 bg-purple-900/20 text-purple-300 hover:text-white hover:bg-purple-800/40 rounded-xl transition-colors duration-200">
                  Browse Courses
                  <ArrowRight className="ml-2 w-4 h-4" aria-hidden="true" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── AI Features ──────────────────────────────────────── */}
      <section className="py-28 relative bg-zinc-900/20" aria-label="AI features">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <Badge variant="secondary" className="bg-purple-900/20 text-purple-400 border-purple-800/50 rounded-full px-4 py-1">
              <Brain className="w-3.5 h-3.5 mr-1.5 inline" aria-hidden="true" />
              AI-Powered Teaching
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight" style={{ textWrap: "balance" }}>
              Let AI Do the Heavy Lifting
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed">
              Stop spending hours grading. Our AI grades exams, gives personalized feedback, and tutors students in real time.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <article className="bg-purple-900/10 border border-purple-800/30 p-8 rounded-3xl space-y-4">
              <div className="w-11 h-11 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/20">
                <Brain className="w-5 h-5 text-purple-400" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-white">AI Exam Grading</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">Open-ended answers graded automatically with per-question feedback and an overall score. Teachers review, not grade.</p>
              <p className="text-xs font-semibold text-purple-400">Saves 5–10 hours/week per instructor</p>
            </article>

            <article className="bg-blue-900/10 border border-blue-800/30 p-8 rounded-3xl space-y-4">
              <div className="w-11 h-11 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
                <MessageSquare className="w-5 h-5 text-blue-400" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-white">Interactive AI Tutor</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">Students get a personalized AI guide during exercises — hints, explanations, and encouragement without giving away answers.</p>
              <p className="text-xs font-semibold text-blue-400">Powered by GPT-5 mini</p>
            </article>

            <article className="bg-amber-900/10 border border-amber-800/30 p-8 rounded-3xl space-y-4">
              <div className="w-11 h-11 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
                <Sparkles className="w-5 h-5 text-amber-400" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-white">Prompt Templates</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">Teachers define exactly how the AI should grade — rubrics, tone, strictness. Full control over feedback quality.</p>
              <p className="text-xs font-semibold text-amber-400">Reusable across all courses</p>
            </article>
          </div>
        </div>
      </section>

      {/* ── Gamification ─────────────────────────────────────── */}
      <section className="py-28 relative overflow-hidden" aria-label="Gamification system">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <Badge variant="secondary" className="bg-amber-900/20 text-amber-400 border-amber-800/50 rounded-full px-4 py-1">
                <Trophy className="w-3.5 h-3.5 mr-1.5 inline" aria-hidden="true" />
                Duolingo-Style Engagement
              </Badge>
              <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight" style={{ textWrap: "balance" }}>
                Students Who Play, Students Who Stay
              </h2>
              <p className="text-zinc-400 text-lg leading-relaxed">
                A full gamification engine built in from day one. No plugins, no integrations — just engaged students who keep coming back.
              </p>
              <ul className="space-y-4" role="list">
                {[
                  { icon: Zap, label: "XP System", desc: "Earn XP for lessons, exams, exercises, comments & reviews" },
                  { icon: TrendingUp, label: "15 Levels", desc: "Progressive level-up milestones that reward consistent learners" },
                  { icon: Flame, label: "Daily Streaks", desc: "Streak bonuses encourage daily habits — exempt from XP cap" },
                  { icon: Award, label: "30 Achievements", desc: "Unlock badges for learning milestones, social engagement & streaks" },
                  { icon: Gem, label: "Coin Store", desc: "Spend earned coins on profile customizations and bonus content" },
                  { icon: BarChart3, label: "Leaderboard", desc: "Weekly rankings motivate healthy competition between students" },
                ].map(({ icon: Icon, label, desc }) => (
                  <li key={label} className="flex items-start gap-4">
                    <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/20 shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-amber-400" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{label}</p>
                      <p className="text-zinc-500 text-sm">{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Visual preview */}
            <div className="relative">
              <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-3xl p-6 space-y-4 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <p className="text-zinc-400 text-sm font-medium">Your Progress</p>
                  <Badge variant="outline" className="border-amber-800/50 text-amber-400 text-xs">Level 7</Badge>
                </div>
                {/* XP bar */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
                    <span>XP Progress</span>
                    <span>3,240 / 4,000 XP</span>
                  </div>
                  <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={81} aria-valuemin={0} aria-valuemax={100} aria-label="XP progress">
                    <div className="h-full w-[81%] bg-gradient-to-r from-amber-500 to-amber-400 rounded-full" />
                  </div>
                </div>
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "🔥 Streak", value: "12 days" },
                    { label: "🪙 Coins", value: "840" },
                    { label: "🏆 Rank", value: "#3" },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-zinc-800/50 rounded-xl p-3 text-center">
                      <p className="text-xs text-zinc-500 mb-1">{stat.label}</p>
                      <p className="text-white font-bold text-sm tabular-nums">{stat.value}</p>
                    </div>
                  ))}
                </div>
                {/* Recent achievements */}
                <div>
                  <p className="text-xs text-zinc-500 mb-2 font-medium">Recent Achievements</p>
                  <div className="flex flex-wrap gap-2">
                    {["🎯 First Exam", "🔥 7-Day Streak", "📚 10 Lessons", "💬 First Comment"].map((badge) => (
                      <span key={badge} className="text-xs bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full border border-zinc-700/50">
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Leaderboard mini */}
                <div className="border-t border-zinc-800 pt-4">
                  <p className="text-xs text-zinc-500 mb-2 font-medium">This Week's Leaders</p>
                  {[
                    { rank: 1, name: "Maria S.", xp: "4,820 XP" },
                    { rank: 2, name: "Carlos R.", xp: "4,210 XP" },
                    { rank: 3, name: "You", xp: "3,240 XP", highlight: true },
                  ].map((row) => (
                    <div
                      key={row.rank}
                      className={`flex items-center justify-between py-1.5 text-sm ${row.highlight ? "text-amber-400 font-semibold" : "text-zinc-400"}`}
                    >
                      <span className="tabular-nums">#{row.rank} {row.name}</span>
                      <span className="tabular-nums">{row.xp}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Glow */}
              <div className="absolute -inset-8 bg-amber-600/5 rounded-full blur-[80px] -z-10" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Full Feature Grid ─────────────────────────────────── */}
      <section className="py-28 bg-zinc-900/20 relative" aria-label="Platform features">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <Badge variant="outline" className="border-zinc-800 text-zinc-400 rounded-full px-4 py-1">
              Everything Included
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight" style={{ textWrap: "balance" }}>
              Every Feature You Need, Nothing You Don't
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed">
              No plugins. No paid add-ons. No nickel-and-diming. Everything ships in the box.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
            {[
              { icon: Code2,     title: "Rich MDX Editor",       desc: "Block-based content editor with video, code highlights, images, embeds, and interactive components.", wrap: "bg-blue-500/10 border-blue-500/20", icon_: "text-blue-400" },
              { icon: FileText,  title: "Exam Builder",           desc: "Multiple choice, open-ended, and true/false questions. Build timed or untimed exams with configurable scoring.", wrap: "bg-violet-500/10 border-violet-500/20", icon_: "text-violet-400" },
              { icon: Play,      title: "Video Lessons",          desc: "Embed YouTube or any video URL inside lessons. Students watch and read in the same view.", wrap: "bg-red-500/10 border-red-500/20", icon_: "text-red-400" },
              { icon: Brain,     title: "AI Exercises",           desc: "Interactive coding and concept exercises guided by an AI tutor. Configurable prompts per exercise.", wrap: "bg-purple-500/10 border-purple-500/20", icon_: "text-purple-400" },
              { icon: CreditCard,title: "Stripe Payments",        desc: "Sell courses individually or via subscription plans. Payments land in your Stripe account directly.", wrap: "bg-emerald-500/10 border-emerald-500/20", icon_: "text-emerald-400" },
              { icon: Layers,    title: "Subscription Plans",     desc: "Create free, paid, and tiered plans. Bundle courses per plan with automatic access control.", wrap: "bg-cyan-500/10 border-cyan-500/20", icon_: "text-cyan-400" },
              { icon: Award,     title: "Certificates",           desc: "Auto-issue signed PDF certificates on course completion. QR-code verification on a public URL.", wrap: "bg-amber-500/10 border-amber-500/20", icon_: "text-amber-400" },
              { icon: Globe2,    title: "Multi-Tenant",           desc: "Every school gets its own subdomain, branding, students, and data — fully isolated at the database level.", wrap: "bg-blue-500/10 border-blue-500/20", icon_: "text-blue-400" },
              { icon: Shield,    title: "Row-Level Security",     desc: "All data scoped by tenant_id via Postgres RLS. No cross-tenant data leakage possible by design.", wrap: "bg-emerald-500/10 border-emerald-500/20", icon_: "text-emerald-400" },
              { icon: Bell,      title: "Notifications",          desc: "Platform notifications with read/unread states, templated emails, and real-time updates.", wrap: "bg-orange-500/10 border-orange-500/20", icon_: "text-orange-400" },
              { icon: BarChart3, title: "Admin Analytics",        desc: "Revenue, enrollment, and engagement dashboards for school admins. Platform-wide metrics for super admins.", wrap: "bg-violet-500/10 border-violet-500/20", icon_: "text-violet-400" },
              { icon: Globe2,    title: "English & Spanish",      desc: "Full internationalization with next-intl. Every UI string translated. Locale switching in the navbar.", wrap: "bg-pink-500/10 border-pink-500/20", icon_: "text-pink-400" },
            ].map((f) => (
              <article
                key={f.title}
                className="bg-zinc-900/40 border border-zinc-800/50 p-6 rounded-2xl hover:bg-zinc-800/40 hover:border-zinc-700/50 transition-[background-color,border-color] duration-200 group"
              >
                <div className={`w-10 h-10 ${f.wrap} rounded-xl flex items-center justify-center mb-4 border group-hover:scale-110 transition-transform duration-200`}>
                  <f.icon className={`w-5 h-5 ${f.icon_}`} aria-hidden="true" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">{f.title}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed group-hover:text-zinc-400 transition-colors duration-200">
                  {f.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────── */}
      <section className="py-28 relative" aria-label="How the platform works">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <Badge variant="outline" className="border-zinc-800 text-zinc-400 rounded-full px-4 py-1">
              How It Works
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight" style={{ textWrap: "balance" }}>
              From Idea to Live School in 3 Steps
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto relative">
            <div className="hidden md:block absolute top-10 left-[33%] right-[33%] h-px bg-gradient-to-r from-blue-500/50 to-blue-500/50 via-blue-500/10" aria-hidden="true" />
            {[
              {
                step: "01",
                icon: Rocket,
                title: "Create Your School",
                description: "Sign up, pick a name, get your own subdomain. Takes 30 seconds.",
              },
              {
                step: "02",
                icon: BookOpen,
                title: "Build Your Courses",
                description: "Use the block editor to add lessons, exams, and exercises. Publish when ready.",
              },
              {
                step: "03",
                icon: Users,
                title: "Students Enroll & Learn",
                description: "Share your link, accept payments via Stripe, and watch your students progress.",
              },
            ].map((step) => (
              <article key={step.step} className="flex flex-col items-center text-center space-y-4">
                <div className="relative">
                  <div className="w-20 h-20 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center ring-1 ring-zinc-700/50">
                    <step.icon className="w-8 h-8 text-blue-400" aria-hidden="true" />
                  </div>
                  <span className="absolute -top-2 -right-2 text-xs font-black text-zinc-600 bg-zinc-900 border border-zinc-800 rounded-full w-6 h-6 flex items-center justify-center" aria-hidden="true">
                    {step.step}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white">{step.title}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Multi-Tenant Callout ──────────────────────────────── */}
      <section className="py-28 bg-zinc-900/20" aria-label="Multi-tenant architecture">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center max-w-5xl mx-auto">
            <div className="space-y-6">
              <Badge variant="secondary" className="bg-blue-900/20 text-blue-400 border-blue-800/50 rounded-full px-4 py-1">
                <Globe2 className="w-3.5 h-3.5 mr-1.5 inline" aria-hidden="true" />
                True Multi-Tenancy
              </Badge>
              <h2 className="text-4xl font-bold text-white tracking-tight" style={{ textWrap: "balance" }}>
                Every School Is a Completely Separate World
              </h2>
              <p className="text-zinc-400 leading-relaxed">
                Database-level isolation means School A can never see School B's students,
                courses, or transactions — even if they share the same platform.
                RLS policies enforce this at the query level, not the application layer.
              </p>
              <ul className="space-y-3" role="list">
                {[
                  "Dedicated subdomain: yourschool.platform.com",
                  "Independent branding — logo, colors, site name",
                  "Isolated student base — no cross-school visibility",
                  "Separate Stripe Connect account per school",
                  "Role-based access: admin, teacher, student per school",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-zinc-300">
                    <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Visual */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-900/10 border border-blue-800/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <GraduationCap className="w-4 h-4 text-blue-400" aria-hidden="true" />
                  </div>
                  <Badge variant="outline" className="border-blue-800/50 text-blue-400 text-xs">Pro</Badge>
                </div>
                <p className="text-white font-semibold text-sm">Code Academy</p>
                <div className="flex gap-3 text-xs text-zinc-500">
                  <span className="tabular-nums">124 students</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">8 courses</span>
                </div>
              </div>

              <div className="bg-purple-900/10 border border-purple-800/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <GraduationCap className="w-4 h-4 text-purple-400" aria-hidden="true" />
                  </div>
                  <Badge variant="outline" className="border-purple-800/50 text-purple-400 text-xs">Starter</Badge>
                </div>
                <p className="text-white font-semibold text-sm">Design School</p>
                <div className="flex gap-3 text-xs text-zinc-500">
                  <span className="tabular-nums">89 students</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">5 courses</span>
                </div>
              </div>

              <div className="bg-emerald-900/10 border border-emerald-800/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                    <GraduationCap className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  </div>
                  <Badge variant="outline" className="border-emerald-800/50 text-emerald-400 text-xs">Business</Badge>
                </div>
                <p className="text-white font-semibold text-sm">Data Labs</p>
                <div className="flex gap-3 text-xs text-zinc-500">
                  <span className="tabular-nums">312 students</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">14 courses</span>
                </div>
              </div>

              <div className="bg-amber-900/10 border border-amber-800/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">
                    <GraduationCap className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  </div>
                  <Badge variant="outline" className="border-amber-800/50 text-amber-400 text-xs">Free</Badge>
                </div>
                <p className="text-white font-semibold text-sm">DevBoot</p>
                <div className="flex gap-3 text-xs text-zinc-500">
                  <span className="tabular-nums">47 students</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">3 courses</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing Teaser ───────────────────────────────────── */}
      <section className="py-28 relative" aria-label="Pricing overview">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight" style={{ textWrap: "balance" }}>
              Start Free. Grow Without Limits.
            </h2>
            <p className="text-zinc-400 text-lg">
              No platform fee on the free plan. Upgrade when you're ready to scale.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
            {[
              { plan: "Free", price: "$0", features: ["5 courses", "50 students", "Manual payments"], highlight: false },
              { plan: "Starter", price: "$9/mo", features: ["15 courses", "200 students", "Stripe payments"], highlight: false },
              {
                plan: "Pro",
                price: "$29/mo",
                features: ["100 courses", "1,000 students", "2% transaction fee", "All AI features"],
                highlight: true,
              },
              {
                plan: "Business",
                price: "$79/mo",
                features: ["Unlimited courses", "Unlimited students", "0% transaction fee", "Priority support"],
                highlight: false,
              },
            ].map((tier) => (
              <article
                key={tier.plan}
                className={`rounded-2xl p-6 space-y-4 ${
                  tier.highlight
                    ? "bg-blue-600 border border-blue-500 shadow-[0_0_40px_rgba(37,99,235,0.2)]"
                    : "bg-zinc-900/40 border border-zinc-800"
                }`}
              >
                <div>
                  <p className={`text-sm font-semibold mb-1 ${tier.highlight ? "text-blue-100" : "text-zinc-400"}`}>
                    {tier.plan}
                  </p>
                  <p className={`text-3xl font-black tabular-nums ${tier.highlight ? "text-white" : "text-white"}`}>
                    {tier.price}
                  </p>
                </div>
                <ul className="space-y-2" role="list">
                  {tier.features.map((f) => (
                    <li key={f} className={`flex items-center gap-2 text-sm ${tier.highlight ? "text-blue-100" : "text-zinc-400"}`}>
                      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${tier.highlight ? "text-white" : "text-zinc-600"}`} aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link href="/platform-pricing">
              <Button variant="ghost" className="text-zinc-400 hover:text-white transition-colors duration-200">
                See full pricing details
                <ArrowRight className="ml-2 w-4 h-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="py-24 relative overflow-hidden" aria-label="Call to action">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 rounded-[2.5rem] p-12 md:p-20 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" aria-hidden="true" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" aria-hidden="true" />

            <div className="max-w-3xl mx-auto space-y-8 relative z-10">
              <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight" style={{ textWrap: "balance" }}>
                Your Academy Is One Click Away
              </h2>
              <p className="text-blue-100 text-xl max-w-2xl mx-auto font-medium">
                Join thousands of creators who have launched their own branded school.
                Free to start. No credit card required.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <Link href="/create-school">
                  <Button
                    size="lg"
                    className="h-14 px-10 bg-white text-blue-600 hover:bg-blue-50 font-bold rounded-xl text-lg transition-colors duration-200 shadow-xl shadow-black/10 active:scale-95"
                  >
                    Create Your Free School
                    <ArrowRight className="ml-2 w-5 h-5" aria-hidden="true" />
                  </Button>
                </Link>
                <Link href="/creators">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-14 px-10 border-white/20 bg-white/10 text-white hover:bg-white/20 rounded-xl text-lg backdrop-blur-md transition-colors duration-200"
                  >
                    Learn More
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="h-20" aria-hidden="true" />
    </div>
  );
}
