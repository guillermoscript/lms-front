import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import {
	Model,
	maxLengthAtom,
	models,
	selectedModelAtom,
	temperatureAtom,
	types,
} from "./Models";
import { TemperatureSelector } from "./TemperatureSelector";
import { ModelSelector } from "./ModelSelector";
import { useAtom } from "jotai";
import { MaxLengthSelector } from "../MaxLengthSelector";

export default function ModelMenu() {
	const [maxLength, setMaxLength] = useAtom<number[]>(maxLengthAtom);
	const [temperature, setTemperature] = useAtom<number[]>(temperatureAtom);
	const [selectedModel, setSelectedModel] = useAtom<Model>(selectedModelAtom);

	return (
		<Sheet>
			<SheetTrigger asChild>
				<button className="btn btn-ghost btn-sm">
					Opciones de modelo
				</button>
			</SheetTrigger>
			<SheetContent className="bg-base-100 rounded-lg">
				<SheetHeader>
					<SheetTitle>Editar Settings</SheetTitle>
					<SheetDescription>
						Aqui puedes editar los settings del chat
					</SheetDescription>
				</SheetHeader>
				<div className="grid gap-4 py-4">
					<ModelSelector
						types={types}
						models={models}
						selectedModel={selectedModel}
						setSelectedModel={setSelectedModel}
					/>
					<TemperatureSelector
						value={temperature}
						setValue={setTemperature}
					/>
					<MaxLengthSelector
						maxValue={selectedModel.length}
						value={maxLength}
						setValue={setMaxLength}
					/>
				</div>
			</SheetContent>
		</Sheet>
	);
}
