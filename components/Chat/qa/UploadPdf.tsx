import useRefreshServerProps from "@/utils/hooks/useRefreshServerProps";

import * as yup from "yup";
import useMutationCreateChat from "@/components/chat/hooks/useMutationCreateChat";
import Form from "@/components/ui/form/Form";
import Input from "@/components/ui/form/Input";
import useMutationUploadPdf from "../hooks/useMutationUploadPdf";
import { useState } from "react";
import { Progress } from "@/components/ui/progress";

const schema = yup.object().shape({
	name: yup.string().required("El nombre de la carpeta es requerido"),
	description: yup
		.string()
		.required("La descripcion de la carpeta es requerida"),
	pdf: yup.mixed().required("El archivo es requerido"),
});

type FormValues = yup.InferType<typeof schema>;

const clasesss = {
	label: "block text-sm font-medium",
	input: "input w-full input-bordered",
	error: "pt-2 text-status-danger",
	container: "form-control w-full gap-3 p-3",
};

export default function UploadPdf() {
	const [progress, setProgress] = useState<number>(0);
	const pdfMutation = useMutationUploadPdf({
		progress: setProgress,
	});

	function onSubmit(values: FormValues) {
		console.log(values);
		// mutation.mutate(values, {
		// 	onSuccess: () => {
		// 		refreshData();
		// 	},
		// });
	}

	return (
		<Form onSubmit={onSubmit} schema={schema} className="w-full gap-3">
			<Input
				name="name"
				displayName="Nombre de la carpeta"
				placeholder="Clases de programacion"
				clasess={clasesss}
			/>
			<Input
				name="description"
				displayName="Descripcion de la carpeta"
				placeholder="todos mis audios de programacion 2"
				clasess={clasesss}
			/>
			<Input
				name="pdf"
				displayName="Archivo"
				type="file"
				clasess={{
					...clasesss,
					input: "ile-input file-input-bordered ",
				}}
			/>
			{pdfMutation.isError && (
				<div className="text-red-500">
					{(pdfMutation.error as any)?.response?.data?.message}
				</div>
			)}

			{pdfMutation.isSuccess && (
				<div className="text-green-500">Se ha creado el chat</div>
			)}

			{pdfMutation.isLoading && (
				<div className="text-green-500">Se esta creando el chat</div>
			)}
			<button
				disabled={pdfMutation.isLoading}
				type="submit"
				className="btn btn-secondary btn-sm my-4 w-full"
			>
				{pdfMutation.isLoading ? "Creando..." : "Crear"}
			</button>
			{progress > 0 && <Progress value={progress} />}
		</Form>
	);
}
