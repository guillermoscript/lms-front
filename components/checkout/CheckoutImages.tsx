type CheckoutImagesProps = {
    img1src: string
    img2src: string
    img3src: string
}

export default function CheckoutImages({
    img1src,
    img2src,
    img3src,
}: CheckoutImagesProps) {
	return (
		<div className="grid gap-6">
			<img
				alt="Course Image"
				className="rounded-lg overflow-hidden"
				height={600}
				src={img1src}
				style={{
					aspectRatio: "800/600",
					objectFit: "cover",
				}}
				width={800}
			/>
			<div className="grid md:grid-cols-2 gap-6">
				<img
					alt="Course Image"
					className="rounded-lg overflow-hidden"
					height={300}
					src={img2src}
					style={{
						aspectRatio: "400/300",
						objectFit: "cover",
					}}
					width={400}
				/>
				<img
					alt="Course Image"
					className="rounded-lg overflow-hidden"
					height={300}
					src={img3src}
					style={{
						aspectRatio: "400/300",
						objectFit: "cover",
					}}
					width={400}
				/>
			</div>
		</div>
	);
}
