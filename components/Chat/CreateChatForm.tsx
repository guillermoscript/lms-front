import useRefreshServerProps from "@/utils/hooks/useRefreshServerProps";
import Form from "@/components/ui/form/Form";
import Input from "@/components/ui/form/Input";
import * as yup from "yup";
import useMutationCreateChat from "./hooks/useMutationCreateChat";
import { yupResolver } from "@hookform/resolvers/yup";
import { useForm, FormProvider } from "react-hook-form";
import { Progress } from "../ui/progress";
import { useState } from "react";
import useMutationUploadPdf from "./hooks/useMutationUploadPdf";
import useMutationPDFai from "./hooks/useMutationPDFai";

const schema = yup.object().shape({
	name: yup.string().required("El nombre de la carpeta es requerido"),
	description: yup
		.string()
		.required("La descripcion de la carpeta es requerida"),
	isPdfSelected: yup.boolean().notRequired(),
	pdf: yup.mixed().when("isPdfSelected", {
		is: true,
		then: (fieldSchema) => fieldSchema.required("El archivo es requerido"),
	}),
});

type FormValues = yup.InferType<typeof schema>;

const clasesss = {
	label: "block text-sm font-medium",
	input: "input w-full input-bordered",
	error: "pt-2 text-status-danger",
	container: "form-control w-full gap-3 p-3",
};

export default function CreateChatForm() {
	const { refreshData } = useRefreshServerProps();
	const mutation = useMutationCreateChat();
	const [progress, setProgress] = useState<number>(0);
	const pdfMutation = useMutationUploadPdf({
		progress: setProgress,
	});
	const mutationPDFai = useMutationPDFai()

	const methods = useForm<FormValues>({
		resolver: yupResolver(schema),
		mode: "all",
	});

	const {
		handleSubmit,
		register,
		watch,
		formState: { errors, isValid },
	} = methods;

	const isPdfSelected = watch("isPdfSelected");

	console.log(isPdfSelected);
	console.log(errors)

	function onSubmit(values: FormValues) {
		console.log(values)
		if (values.isPdfSelected) {
			console.log(values.pdf)
			if (!values.pdf) {
				return;
			}
			// @ts-ignore
			pdfMutation.mutate(values.pdf[0], {
				onSuccess: (pdf) => {
					mutation.mutate(
						{
							name: values.name,
							description: values.description,
							type: 'qa',
						},
						{
							onSuccess: (chatData) => {
								mutationPDFai.mutate({
									documentId: pdf.doc.id,
									chatId: chatData?.doc.id
								}, {
									onSuccess: () => {
										refreshData();
									},
								});
							},
						}
					);
				},
			});
		} else {
			mutation.mutate(values, {
				onSuccess: () => {
					refreshData();
				},
			});
		}
	}

	return (
		<FormProvider {...methods}>
			<form className="w-full gap-3" onSubmit={handleSubmit(onSubmit)}>
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
				<div className="flex flex-col w-full gap-3 p-3">
					<label htmlFor="isPdfSelected" className={clasesss.label}>
						<span className="block text-sm font-medium ">
							Quieres subir un pdf?
						</span>
					</label>
					<input
						type="checkbox"
						{...register("isPdfSelected", {
							required: "Este campo es requerido",
						})}
						className="toggle"
					/>
				</div>

				{isPdfSelected && (
					<div className="flex flex-col w-full gap-3 p-3">
						<label
							htmlFor="isPdfSelected"
							className={clasesss.label}
						>
							<span className="block text-sm font-medium ">
								Quieres subir un pdf?
							</span>
						</label>
						<input
							type="file"
							{...register("pdf")}
							className="file-input file-input-bordered w-full"
							// accept: pdf
							accept="application/pdf"
						/>
					</div>
				)}

				{mutation.isError || pdfMutation.isError || mutationPDFai.isError && (
					<div className="text-red-500">
						{(mutation.error as any)?.response?.data?.message}
						{(pdfMutation.error as any)?.response?.data?.message}
						{(mutationPDFai.error as any)?.response?.data?.message}
					</div>
				)}

				{(pdfMutation.isSuccess && mutationPDFai.isSuccess && mutation.isSuccess) || mutation.isSuccess && (
					<div className="text-green-500">Se ha creado el chat</div>
				)}

				{mutation.isPending || pdfMutation.isPending || mutationPDFai.isPending && (
					<div className="text-gray-500">Creando...</div>
				)}
				<button
					disabled={mutation.isPending || pdfMutation.isPending || mutationPDFai.isPending || !isValid}
					type="submit"
					className="btn btn-secondary btn-sm my-4 w-full disabled:opacity-50"
				>
					{mutation.isPending ? "Creando..." : "Crear"}
				</button>

				{progress > 0 && <Progress value={progress} />}
			</form>
		</FormProvider>
	);
}
