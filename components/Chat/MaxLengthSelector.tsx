import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Slider } from "@radix-ui/react-slider";


interface MaxLengthSelectorProps {
	value: number[]
	setValue: (value: number[]) => void
	maxValue: number
}

export function MaxLengthSelector({ value, setValue, maxValue }: MaxLengthSelectorProps) {
	

	return (
		<div className="grid gap-2 pt-2">
			<HoverCard openDelay={200}>
				<HoverCardTrigger asChild>
					<div className="grid gap-4">
						<div className="flex items-center justify-between">
							<label htmlFor="maxlength">Tamaño máximo</label>
							<span className="w-12 rounded-md border border-transparent px-2 py-0.5 text-right text-sm text-muted-foreground hover:border-border">
								{value}
							</span>
						</div>
						<Slider
							id="maxlength"
							max={maxValue}
							defaultValue={value}
							step={10}
							onValueChange={setValue}
							className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
							aria-label="Tamano maximo"
						/>
					</div>
				</HoverCardTrigger>
				<HoverCardContent
					align="start"
					className="w-[260px] text-sm"
					side="left"
				>
					El número máximo de tokens a generar. Las solicitudes pueden utilizar
					utilizar hasta 2.048 o 16.000 tokens. El máximo de tokens es el límite de la cantidad de palabras o caracteres que puedes ingresar en la APP para realizar una solicitud.
					Cada palabra, número, signo de puntuación y carácter especial, como los espacios en blanco, cuentan como tokens.
					Si tienes errores trata de ajustar este valor.
				</HoverCardContent>
			</HoverCard>
		</div>
	);
}
