export default function Subscribe() {
    return (
        <div className="flex w-full flex-col items-center justify-center gap-4 bg-base-200 px-10 py-16 max-w-4xl mx-auto">
            <div className="mockup-window w-full border bg-base-200">
                <div className="flex flex-col items-center justify-center p-20 gap-4 bg-base-300">
                    <h1 className="text-4xl font-bold text-accent mb-4">
                        Comeinza a aprender hoy!
                    </h1>
                    <p className="text-center text-lg text-secondary mb-4" >
                        Suscribete a nuestro boletin y recibe las ultimas noticias
                    </p>
                    <button className="btn-primary btn">Suscribirse</button>
                </div>
            </div>
        </div>
    );
}
