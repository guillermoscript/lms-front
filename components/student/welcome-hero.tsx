"use client"

import { Button } from "@/components/ui/button"

interface WelcomeHeroProps {
  userName: string
  weeklyGoalProgress: number
}

export function WelcomeHero({ userName, weeklyGoalProgress }: WelcomeHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-teal-900 p-8 md:p-12">
      {/* Decorative Wave Pattern */}
      <div className="absolute inset-0 opacity-30">
        <svg 
          className="absolute right-0 top-0 h-full w-full" 
          viewBox="0 0 1440 800" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <path 
            d="M0 400C240 300 480 500 720 400C960 300 1200 500 1440 400V800H0V400Z" 
            fill="url(#gradient1)" 
            fillOpacity="0.3"
          />
          <path 
            d="M0 500C240 400 480 600 720 500C960 400 1200 600 1440 500V800H0V500Z" 
            fill="url(#gradient2)" 
            fillOpacity="0.2"
          />
          <defs>
            <linearGradient id="gradient1" x1="0" y1="0" x2="1440" y2="0">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#0891b2" />
            </linearGradient>
            <linearGradient id="gradient2" x1="0" y1="0" x2="1440" y2="0">
              <stop offset="0%" stopColor="#0891b2" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Content */}
      <div className="relative z-10 space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-bold text-white">
            Welcome Back, {userName}!
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl">
            You're {weeklyGoalProgress}% through your weekly study goal. Keep pushing to earn your next badge!
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <Button className="bg-cyan-500 hover:bg-cyan-600 text-white font-semibold px-6 h-11">
            View Report
          </Button>
          <Button variant="outline" className="border-slate-600 bg-slate-800/50 hover:bg-slate-700/50 text-white font-semibold px-6 h-11">
            Update Goals
          </Button>
        </div>
      </div>
    </div>
  )
}
