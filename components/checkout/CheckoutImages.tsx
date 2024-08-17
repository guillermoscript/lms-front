interface CheckoutImagesProps {
    img1src?: string | null | undefined
    img2src?: string | null | undefined
    img3src?: string | null | undefined
}

export default function CheckoutImages ({
    img1src,
    img2src,
    img3src
}: CheckoutImagesProps) {
    return (
        <div className="grid gap-6">
            <img
                alt="Course Image"
                className="rounded-lg overflow-hidden"
                height={600}
                src={img1src ?? ''}
                style={{
                    aspectRatio: '800/600',
                    objectFit: 'cover'
                }}
                width={800}
            />
        </div>
    )
}
