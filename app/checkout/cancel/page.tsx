export default function Success({ params }) {
	console.log(params);
	return (
		<div className="flex w-full p-3 justify-center">
			<div className="flex items-center justify-center h-screen">
				<div>
					<div className="flex flex-col items-center gap-3 space-y-2">
						
						<h1 className="text-4xl font-bold">
                            Error
                        </h1>
						<p>
							There was an error with your payment. Please try again. or contact us
						</p>
						<a className="inline-flex items-center px-4 py-2 text-white bg-indigo-600 border border-indigo-600 rounded rounded-full hover:bg-indigo-700 focus:outline-none focus:ring">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								className="w-3 h-3 mr-2"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M7 16l-4-4m0 0l4-4m-4 4h18"
								/>
							</svg>
							<span className="text-sm font-medium">Home</span>
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
