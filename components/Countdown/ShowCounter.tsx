export default function ShowCounter({ days, hours, minutes, seconds }: { days: number, hours: number, minutes: number, seconds: number }) {

    return (
        <div className="font-mono text-2xl mb-4">
            <span className="text-2xl font-bold text-secondary">Faltan </span>
            <span className="text-2xl font-bold text-secondary">{days}</span>
            <span className="text-2xl font-bold text-secondary"> días </span>
            <span className="text-2xl font-bold text-secondary">{hours}</span>
            <span className="text-2xl font-bold text-secondary"> horas </span>
            <span className="text-2xl font-bold text-secondary">{minutes}</span>
            <span className="text-2xl font-bold text-secondary"> minutos </span>
            <span className="text-2xl font-bold text-secondary">{seconds}</span>
            <span className="text-2xl font-bold text-secondary"> segundos </span>
        </div>
    )
}