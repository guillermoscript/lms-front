"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List } from "lucide-react";

export function FilterSidebar() {
    const [priceRange, setPriceRange] = useState([0, 200]);

    const categories = [
        { id: "all", label: "All Categories" },
        { id: "dev", label: "Development" },
        { id: "design", label: "Design" },
        { id: "business", label: "Business" },
        { id: "marketing", label: "Marketing" },
    ];

    const levels = [
        { id: "beginner", label: "Beginner" },
        { id: "intermediate", label: "Intermediate" },
        { id: "advanced", label: "Advanced" },
    ];

    return (
        <div className="space-y-8">
            {/* View Toggle (Visual Only) */}
            <div className="hidden">
                {/* This could be state-driven in a real app */}
            </div>

            {/* Categories */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Categories</h3>
                <div className="space-y-2">
                    {categories.map((cat) => (
                        <div key={cat.id} className="flex items-center space-x-2 group cursor-pointer">
                            <LayoutGrid className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                            <span className={`text-sm ${cat.id === "dev" ? "text-white font-medium" : "text-zinc-400 group-hover:text-zinc-200"}`}>
                                {cat.label}
                            </span>
                            {cat.id === "dev" && (
                                <span className="ml-auto text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">124</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="h-px bg-zinc-800" />

            {/* Level */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Level</h3>
                <div className="space-y-3">
                    {levels.map((level) => (
                        <div key={level.id} className="flex items-center space-x-2">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${level.id === "intermediate" ? "border-blue-500" : "border-zinc-700"
                                }`}>
                                {level.id === "intermediate" && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                            </div>
                            <span className="text-sm text-zinc-300">{level.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="h-px bg-zinc-800" />

            {/* Price Range */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Price Range</h3>
                <Slider
                    defaultValue={[0]}
                    max={200}
                    step={1}
                    className="w-full"
                // Customize slider colors via globals.css or class overrides if needed
                />
                <div className="flex justify-between text-xs text-zinc-400">
                    <span>$0</span>
                    <span>$200+</span>
                </div>
            </div>
        </div>
    );
}
