export default function NoActiveSub() {
    return (
        <div className="hero min-h-screen bg-base-200">
            <div className="hero-content text-center">
                <div className="max-w-md bg-error-content shadow-xl rounded-xl p-8">
                    <h1 className="text-5xl font-bold text-error">No hay suscripción activa</h1>
                    <p className="py-6 text-error">
                        Provident cupiditate voluptatem et in. Quaerat fugiat ut
                        assumenda excepturi exercitationem quasi. In deleniti
                        eaque aut repudiandae et a id nisi.
                    </p>
                    <button className="btn-primary btn">Get Started</button>
                </div>
            </div>
        </div>
    );
}
