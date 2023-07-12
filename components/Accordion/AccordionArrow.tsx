
export type AccordionArrowProps = {
    title: string
    content: React.ReactNode
    name: string
}

export default function AccordionArrow({ title, content, name }: AccordionArrowProps) {
    return (
        <>
            <div className="collapse collapse-arrow bg-base-200 mb-4">
                <input type="radio" name={name} />
                <div className="collapse-title text-xl font-medium">{title}</div>
                <div className="collapse-content">
                    {content}
                </div>
            </div>
        </>
    );
}
