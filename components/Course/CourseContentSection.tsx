export default function CourseContentSection() {
    return (
        <div className="hero min-h-screen bg-base-200">
            <div className="hero-content flex-col gap-8 lg:flex-row">
                <div>
                    <h5 className="py-6  text-xl">
                        Para este curso necesitas vas a necesitar:
                    </h5>
                    <ul>
                        <div className="chat chat-start">
                            <div className="chat-bubble chat-bubble-primary">
                                What kind of nonsense is this
                            </div>
                        </div>
                        <div className="chat chat-start">
                            <div className="chat-bubble chat-bubble-secondary">
                                Put me on the Council and not make me a
                                Master!??
                            </div>
                        </div>
                        <div className="chat chat-start">
                            <div className="chat-bubble chat-bubble-accent">
                                Thats never been done in the history of the
                                Jedi. Its insulting!
                            </div>
                        </div>
                        <div className="chat chat-end">
                            <div className="chat-bubble chat-bubble-info">
                                Calm down, Anakin.
                            </div>
                        </div>
                        <div className="chat chat-end">
                            <div className="chat-bubble chat-bubble-success">
                                You have been given a great honor.
                            </div>
                        </div>
                        <div className="chat chat-end">
                            <div className="chat-bubble chat-bubble-warning">
                                To be on the Council at your age.
                            </div>
                        </div>
                        <div className="chat chat-end">
                            <div className="chat-bubble chat-bubble-error">
                                Its never happened before.
                            </div>
                        </div>
                    </ul>
                </div>
                <div>
                    <h3 className="text-5xl font-bold">
                        Comienza a aprender hoy!
                    </h3>
                    <p className="py-6">
                        Provident cupiditate voluptatem et in. Quaerat
                    </p>
                    <div className="flex gap-3 mb-6">
                        <ul className="steps steps-vertical w-full">
                            <li className="step-primary step">
                                <button className="btn w-full">Leccion 1</button>
                            </li>
                            <li className="step-primary step">
                                <button className="btn w-full">Leccion 2</button>
                            </li>
                            <li className="step ">
                                <button className="btn w-full">Leccion 3</button>
                            </li>
                            <li className="step">
                                <button className="btn w-full">Leccion 4</button>
                            </li>
                        </ul>
                    </div>
                    <button className="btn-primary btn">Get Started</button>
                </div>
            </div>
        </div>
    );
}
