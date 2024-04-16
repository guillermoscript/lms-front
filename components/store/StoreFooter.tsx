import { Separator } from "../ui/separator";

export default function StoreFooter() {
	return (
		<div className="mx-auto md:w-full max-w-7xl px-8">
            <Separator />
			<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10 py-16">
				<div className="md:row-start-1 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-10 md:text-sm flex flex-col w-full">
					<FooterSection
						title="Clothing"
						items={[
							"Tops",
							"Dresses",
							"Pants",
							"Denim",
							"Sweaters",
							"T-Shirts",
							"Jackets",
							"Activewear",
							"Browse All",
						]}
					/>
					<FooterSection
						title="Accessories"
						items={[
							"Watches",
							"Wallets",
							"Bags",
							"Sunglasses",
							"Hats",
							"Belts",
						]}
					/>
					<FooterSection
						title="Brands"
						items={[
							"Full Nelson",
							"My Way",
							"Re-Arranged",
							"Counterfeit",
							"Significant Other",
						]}
					/>
				</div>
				<div className="md:col-start-2 md:grid md:grid-cols-2 md:gap-x-8">
					<div className="group relative text-base sm:text-sm">
						<div className="aspect-h-1 aspect-w-1 overflow-hidden rounded-lg bg-gray-100 group-hover:opacity-75">
							<img
								src="https://tailwindui.com/img/ecommerce-images/mega-menu-category-01.jpg"
								alt="Models sitting back to back, wearing Basic Tee in black and bone."
								className="object-cover object-center"
							/>
						</div>
						<a
							href="#"
							className="mt-6 block font-medium text-gray-900"
						>
							<span
								className="absolute inset-0 z-10"
								aria-hidden="true"
							/>
							New Arrivals
						</a>
						<p aria-hidden="true" className="mt-1">
							Shop now
						</p>
					</div>
					<div className="group relative text-base sm:text-sm">
						<div className="aspect-h-1 aspect-w-1 overflow-hidden rounded-lg bg-gray-100 group-hover:opacity-75">
							<img
								src="https://tailwindui.com/img/ecommerce-images/mega-menu-category-02.jpg"
								alt="Close up of Basic Tee fall bundle with off-white, ochre, olive, and black tees."
								className="object-cover object-center"
							/>
						</div>
						<a
							href="#"
							className="mt-6 block font-medium text-gray-900"
						>
							<span
								className="absolute inset-0 z-10"
								aria-hidden="true"
							/>
							Basic Tees
						</a>
						<p aria-hidden="true" className="mt-1">
							Shop now
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

function FooterSection({ title, items }: { title: string; items: string[] }) {
	return (
		<div className="w-full ">
			<p id={`${title}-heading`} className="font-medium text-gray-900">
				{title}
			</p>
			<ul
				role="list"
				aria-labelledby={`${title}-heading`}
				className="mt-6 space-y-6 sm:mt-4 sm:space-y-4"
			>
				{items.map((item) => (
					<li className="flex" key={item}>
						<a href="#" className="hover:text-gray-800">
							{item}
						</a>
					</li>
				))}
			</ul>
		</div>
	);
}
