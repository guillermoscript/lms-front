import { Play, Maximize2, Volume2, Settings } from "lucide-react";

export function VideoPlayerMock() {
    return (
        <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-border shadow-2xl bg-card group">
            {/* Background/Thumbnail Placeholder */}
            <div className="absolute inset-0 bg-muted flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-foreground/10 backdrop-blur-sm flex items-center justify-center pl-1 group-hover:scale-110 transition-transform cursor-pointer">
                    <Play className="w-6 h-6 text-foreground fill-foreground" />
                </div>
            </div>

            {/* Overlay UI */}
            <div className="absolute bottom-4 left-4 right-4 bg-card/90 backdrop-blur-md rounded-lg p-3 border border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-brand-tint flex items-center justify-center">
                        <Play className="w-4 h-4 text-brand-text fill-brand-text" />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-brand-text tracking-wider">NOW PLAYING</div>
                        <div className="text-sm font-medium text-foreground">Introduction to Server Actions</div>
                    </div>
                </div>
                <div className="text-xs text-muted-foreground font-mono">12:34</div>
            </div>

            {/* Top Controls */}
            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Settings className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-pointer" />
                <Maximize2 className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-pointer" />
            </div>
        </div>
    );
}
