"use client";

import * as React from "react";
import { CaretSortIcon, CheckIcon } from "@radix-ui/react-icons";
import { PopoverProps } from "@radix-ui/react-popover";

import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { cn } from "@/utils/utils";
import { Model, ModelType } from "./Models";
import { Button } from "@/components/ui/button";
import { useMutationObserver } from "@/utils/hooks/useMutationObserver";

interface ModelSelectorProps extends PopoverProps {
	types: readonly ModelType[];
	models: Model[];
	selectedModel: Model;
	setSelectedModel: React.Dispatch<React.SetStateAction<Model>>;
}

export function ModelSelector({
	models,
	types,
	selectedModel,
	setSelectedModel,
	...props
}: ModelSelectorProps) {
	const [open, setOpen] = React.useState(false);
	const [peekedModel, setPeekedModel] = React.useState<Model>(models[0]);

	return (
		<div className="grid gap-2">
			<HoverCard openDelay={200}>
				<HoverCardTrigger asChild>
					<label className="text-sm" htmlFor="model">
						Model
					</label>
				</HoverCardTrigger>
				<HoverCardContent
					align="start"
					className="w-[260px] text-sm"
					side="left"
				>
					The model which will generate the completion. Some models
					are suitable for natural language tasks, others specialize
					in code. Learn more.
				</HoverCardContent>
			</HoverCard>

            <p className="text-sm text-gray-500">
                {selectedModel.name}
            </p>

			<Command loop>
				<CommandList className="h-[var(--cmdk-list-height)] max-h-[400px]">
					<CommandInput placeholder="Search Models..." />
					<CommandEmpty>No Models found.</CommandEmpty>

					{types.map((type) => (
						<CommandGroup key={type} heading={type}>
							{models
								.filter((model) => model.type === type)
								.map((model) => (
									<ModelItem
										key={model.id}
										model={model}
										isSelected={
											selectedModel?.id === model.id
										}
										onPeek={(model) =>
											setPeekedModel(model)
										}
										onSelect={() => {
											setSelectedModel(model);
											setOpen(false);
										}}
									/>
								))}
						</CommandGroup>
					))}
				</CommandList>
			</Command>
		</div>
	);
}

interface ModelItemProps {
	model: Model;
	isSelected: boolean;
	onSelect: () => void;
	onPeek: (model: Model) => void;
}

function ModelItem({ model, isSelected, onSelect, onPeek }: ModelItemProps) {
	const ref = React.useRef<HTMLDivElement>(null);

	useMutationObserver(ref, (mutations) => {
		for (const mutation of mutations) {
			if (mutation.type === "attributes") {
				if (mutation.attributeName === "aria-selected") {
					onPeek(model);
				}
			}
		}
	});

	return (
		<CommandItem
			key={model.id}
			onSelect={onSelect}
			ref={ref}
			className="aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:text-white"
		>
			{model.name}
			<CheckIcon
				className={cn(
					"ml-auto h-4 w-4",
					isSelected ? "opacity-100" : "opacity-0"
				)}
			/>
		</CommandItem>
	);
}
