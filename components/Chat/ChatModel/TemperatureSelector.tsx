"use client";

import * as React from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Slider } from "@/components/ui/slider";


interface TemperatureSelectorProps {
	value: number[]
    setValue: React.Dispatch<React.SetStateAction<number[]>>;
}

export function TemperatureSelector({
	value,
    setValue
}: TemperatureSelectorProps) {

	return (
		<div className="grid gap-2 pt-2">
			<HoverCard openDelay={200}>
				<HoverCardTrigger asChild>
					<div className="grid gap-4">
						<div className="flex items-center justify-between">
							<label 
                                className="text-sm "
                                htmlFor="temperature">Temperature</label>
							<span className="w-12 rounded-md border border-transparent px-2 py-0.5 text-right text-sm text-muted-foreground hover:border-border">
								{value}
							</span>
						</div>
						<Slider
							id="temperature"
							max={2}
							value={value}
							step={0.1}
							onValueChange={setValue}
							className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
							aria-label="Temperature"
						/>
					</div>
				</HoverCardTrigger>
				<HoverCardContent
					align="start"
					className="w-[260px] text-sm"
					side="left"
				>
					Controls randomness: lowering results in less random
					completions. As the temperature approaches zero, the model
					will become deterministic and repetitive.
				</HoverCardContent>
			</HoverCard>
		</div>
	);
}
