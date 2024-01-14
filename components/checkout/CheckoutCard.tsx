"use client";

import { RadioGroup } from "@radix-ui/react-dropdown-menu";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
	CardFooter,
} from "@/components/ui/card";
import React, { useState } from "react";

import Image from "next/image";
import { useForm } from "react-hook-form";
import { Database } from "@/utils/supabase/supabase";

type formValues = {
	radio: 'binance' | 'paypal' | 'card';
};

export default function CheckoutCard({ productId }: { productId: string }) {
	
	const { register, handleSubmit } = useForm<formValues>({
		mode: "onBlur",
	});

	async function onSubmit(data: formValues) {
		console.log(data);

		if (data.radio === "card") {
			try {
				const data = await fetch("/stripe/checkout", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ productId }),
				})
	
				const response = await data.json()
	
				console.log(response)
				window.location.href = response.url
			} catch (error) {
				console.log(error)
			}

		} else if (data.radio === "binance") {
			console.log("binance")
		} else if (data.radio === "paypal") {
			console.log("paypal")
		}
	}

	return (
		<>
			<form
				onSubmit={handleSubmit(onSubmit)}
				className="mt-5 grid gap-6 w-full"
			>
				<PaymentMethodSection
					image={
						<Image
							src={"/img/binance.png"}
							width={36}
							height={36}
							alt="Binance"
						/>
					}
					title={"Binance"}
					description={"Pay with Binance"}
					inputId={"binance"}
					inputName={"radio"}
					register={register}
				/>
				<PaymentMethodSection
					image={
						<svg
						className="mb-3 h-6 w-6"
							aria-hidden="true"
							focusable="false"
							role="img"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 384 512"
						>
							<path
								fill="currentColor"
								d="M111.4 295.9c-3.5 19.2-17.4 108.7-21.5 134-.3 1.8-1 2.5-3 2.5H12.3c-7.6 0-13.1-6.6-12.1-13.9L58.8 46.6c1.5-9.6 10.1-16.9 20-16.9 152.3 0 165.1-3.7 204 11.4 60.1 23.3 65.6 79.5 44 140.3-21.5 62.6-72.5 89.5-140.1 90.3-43.4 .7-69.5-7-75.3 24.2zM357.1 152c-1.8-1.3-2.5-1.8-3 1.3-2 11.4-5.1 22.5-8.8 33.6-39.9 113.8-150.5 103.9-204.5 103.9-6.1 0-10.1 3.3-10.9 9.4-22.6 140.4-27.1 169.7-27.1 169.7-1 7.1 3.5 12.9 10.6 12.9h63.5c8.6 0 15.7-6.3 17.4-14.9 .7-5.4-1.1 6.1 14.4-91.3 4.6-22 14.3-19.7 29.3-19.7 71 0 126.4-28.8 142.9-112.3 6.5-34.8 4.6-71.4-23.8-92.6z"
							></path>
						</svg>
					}
					title={"Paypal"}
					description={"Pay with Paypal"}
					inputId={"paypal"}
					inputName={"radio"}
					register={register}
				/>
				<PaymentMethodSection
					image={
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							className="mb-3 h-6 w-6"
						>
							<rect width="20" height="14" x="2" y="5" rx="2" />
							<path d="M2 10h20" />
						</svg>
					}
					title={"Card"}
					description={"Pay with Card"}
					inputId={"card"}
					inputName={"radio"}
					register={register}
				/>
				<button
					
					className="w-full btn-primary btn"
				>
					Continue
				</button>
			</form>
		</>
	);
}

function PaymentMethodSection({
	image,
	title,
	description,
	inputId,
	register,
	inputName,
}: {
	inputName: string;
	inputId: string;
	image: React.ReactNode;
	title: string;
	description: string;
	register: any;
}) {
	return (
		<div className="relative">
			<input
				className="peer hidden"
				id={inputId}
				type="radio"
				name={inputName}
				value={inputId}
				{...register(inputName)}
			/>
			<span className="peer-checked:border-gray-700 absolute right-4 top-1/2 box-content block h-3 w-3 -translate-y-1/2 rounded-full border-8 border-gray-300 bg-white dark:bg-gray-700 dark:border-gray-700 dark:peer-checked:border-gray-700 dark:peer-checked:bg-gray-700"></span>
			<label
				className="peer-checked:border-2 peer-checked:border-gray-700 peer-checked:bg-gray-50 flex cursor-pointer select-none rounded-lg border border-gray-300 p-4 dark:border-gray-700 dark:peer-checked:border-gray-700 dark:peer-checked:bg-gray-700"
				htmlFor={inputId}
			>
				{image}
				<div className="ml-5">
					<span className="mt-2 font-semibold">{title}</span>
					<p className="text-slate-500 text-sm leading-6 dark:text-gray-400">
						{description}
					</p>
				</div>
			</label>
		</div>
	);
}
