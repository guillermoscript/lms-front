import { Play, Maximize2, Volume2, Settings } from "lucide-react";

export function VideoPlayerMock() {
    return (
        <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-zinc-900 group">
            {/* Background/Thumbnail Placeholder */}
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center pl-1 group-hover:scale-110 transition-transform cursor-pointer">
                    <Play className="w-6 h-6 text-white fill-white" />
                </div>
            </div>

            {/* Overlay UI */}
            <div className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-md rounded-lg p-3 border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-blue-500/20 flex items-center justify-center">
                        <Play className="w-4 h-4 text-blue-400 fill-blue-400" />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-blue-400 tracking-wider">NOW PLAYING</div>
                        <div className="text-sm font-medium text-white">Introduction to Server Actions</div>
                    </div>
                </div>
                <div className="text-xs text-zinc-400 font-mono">12:34</div>
            </div>

            {/* Top Controls */}
            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Settings className="w-4 h-4 text-zinc-400 hover:text-white cursor-pointer" />
                <Maximize2 className="w-4 h-4 text-zinc-400 hover:text-white cursor-pointer" />
            </div>
        </div>
    );
}
