export default function Loading () {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-6 py-12 md:py-20">
      <div className="grid md:grid-cols-2 gap-10 md:gap-16">
        <div className="animate-pulse bg-gray-200 rounded-lg h-96 w-full md:w-[calc(100%-1rem)]"></div>
        <div className="space-y-4">
          <div className="animate-pulse bg-gray-200 rounded-lg h-8 w-1/2"></div>
          <div className="animate-pulse bg-gray-200 rounded-lg h-8 w-3/4"></div>
          <div className="animate-pulse bg-gray-200 rounded-lg h-8 w-1/2"></div>
          <div className="animate-pulse bg-gray-200 rounded-lg h-8 w-3/4"></div>
          <div className="animate-pulse bg-gray-200 rounded-lg h-8 w-1/2"></div>
          <div className="animate-pulse bg-gray-200 rounded-lg h-8 w-3/4"></div>
          <div className="animate-pulse bg-gray-200 rounded-lg h-8 w-1/2"></div>
          <div className="animate-pulse bg-gray-200 rounded-lg h-8 w-3/4"></div>
        </div>
      </div>
    </div>
  )
}
