"use client";

import React from "react";

import Image from "next/image";
import { useForm } from "react-hook-form";
import { Button } from "../ui/button";
import { Label } from "@radix-ui/react-dropdown-menu";
import { CreditCardIcon, BitcoinIcon } from "lucide-react";

type formValues = {
	radio: "binance" | "paypal" | "card";
};

export default function CheckoutCard({ productId }: { productId: string }) {
	const {
		register,
		handleSubmit,
		formState: { isSubmitting },
	} = useForm<formValues>({
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
				});

				const response = await data.json();

				console.log(response);
				window.location.href = response.url;
			} catch (error) {
				console.log(error);
			}
		} else if (data.radio === "binance") {
			console.log("binance");
		} else if (data.radio === "paypal") {
			console.log("paypal");
		}
	}

	return (
		<>
			<form 
				onSubmit={handleSubmit(onSubmit)}
				className="space-y-4">
				{/* <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Enter your name" type="text" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" placeholder="Enter your email" type="email" />
            </div> */}
				<div className="space-y-4">
					<Label>Payment Method</Label>
					<div className="grid grid-cols-3 gap-4">
						<Button  variant="outline">
							<CreditCardIcon className="h-6 w-6" />
							Stripe
						</Button>
						<Button  variant="outline">
							<CreditCardIcon className="h-6 w-6" />
							PayPal
						</Button>
						<Button  variant="outline">
							<BitcoinIcon className="h-6 w-6" />
							Crypto
						</Button>
					</div>
				</div>
				<Button size="lg">Complete Purchase</Button>
			</form>
		</>
	);
}
