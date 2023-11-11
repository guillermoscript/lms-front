import { useState } from "react";
import useLLM from "usellm";


const createPrompt = (paragraphs: string[], question: string) => `
Read the following paragraphs from a longer document and answer the question below.

--DOCUMENT BEGINS--

${paragraphs.join("\n\n")}

--DOCUMENT ENDS--

Question: ${question}
`;

export default function QAChat({value}: {value?: string}) {
    console.log(value)
    const [documentText, setDocumentText] = useState(value || "");
    const [paragraphs, setParagraphs] = useState<string[]>([]);
    const [documentEmbeddings, setDocumentEmbeddings] = useState<number[][]>([]);
    const [question, setQuestion] = useState("");
    const [matchedParagraphs, setMatchedParagraphs] = useState<string[]>([]);
    const [answer, setAnswer] = useState("");
    const [status, setStatus] = useState("");

    const llm = useLLM({
      serviceUrl: "https://usellm.org/api/llm", // For testing only. Follow this guide to create your own service URL: https://usellm.org/docs/api-reference/create-llm-service
        // serviceUrl: "/api/llm",
    });

    async function handleEmbedClick() {
        setStatus("Embedding...");
        if (!documentText) {
            window.alert("Please enter some text for the document!");
            return;
        }
        setDocumentEmbeddings([]);
        setMatchedParagraphs([]);
        setAnswer("");
        const paragraphs = documentText
            .split("\n")
            .map((p) => p.trim())
            .filter((p) => p.length > 0)
            .slice(0, 100)
            .map((p) => p.trim().substring(0, 1000));
        setParagraphs(paragraphs);
        const { embeddings } = await llm.embed({ input: paragraphs });
        setDocumentEmbeddings(embeddings);
        setStatus("");
    }

    async function handleSubmitClick() {
        setStatus("Answering...");
        setMatchedParagraphs([]);
        setAnswer("");
        if (!documentEmbeddings.length) {
            window.alert("Please embed the document first!");
            return;
        }
    
        if (!question) {
            window.alert("Please enter a question!");
            return;
        }
    
        const { embeddings } = await llm.embed({ input: question });
        const matchingParagraphs = llm
            .scoreEmbeddings({
            embeddings: documentEmbeddings,
            query: embeddings[0],
            top: 3,
            })
            .map(({ index }) => paragraphs[index]);
        setMatchedParagraphs(matchingParagraphs);
    
        const initialMessage = {
            role: "user",
            content: createPrompt(matchingParagraphs, question),
        };
        const { message } = await llm.chat({
            messages: [initialMessage],
            stream: true,
            onStream: ({ message }) => setAnswer(message.content),
        });
        setAnswer(message.content);
        setStatus("");
    }

    return (
        <div className="overflow-y-auto">

            {!status &&
                !answer &&
                matchedParagraphs.length === 0 && (
                <div className="prose dark:prose-invert my-8">
                <h3 className="text-lg font-semibold mb-4">Instrucciones</h3>
                <p className="mb-4">
                    Los 20 primeros párrafos del documento se tendrán en cuenta para la incrustación.
                    En cada párrafo, sólo se tendrán en cuenta los 1.000 primeros caracteres.
                    La incrustación de la pregunta se utilizará para encontrar los 3 párrafos más coincidentes utilizando un coseno similar.
                    Los párrafos coincidentes se pasarán junto con la pregunta a la API de finalización de chat de OpenAI para generar una respuesta.
                </p>
                <p>
                    Para una mejor experiencia, asegúrese de colocar los parrafos en los limites correctos y que la pregunta sea relevante y lo mas cohernte posible.
                </p>
                </div>
            )}

            <h2 className="text-2xl font-semibold mb-4">Preguntas y respuestas</h2>
            <textarea
                className="textarea textarea-secondary w-full mb-6"
                rows={10}
                placeholder="Pega el texto del documento aquí"
                value={documentText}
                onChange={(e) => setDocumentText(e.target.value)}
            />
            <div className="flex flex-col mb-4">
                <label className="text-sm font-medium mb-2">Dale Click al botón para incrustar el documento, luego introduce una pregunta y dale click al botón para enviar la pregunta.</label>
                <button
                onClick={handleEmbedClick}
                className="btn btn-secondary mr-2 mb-4"
                >
                    Incrustar documento
                </button>
                {documentEmbeddings.length > 0 && (
                    <div className="ml-2">
                        {documentEmbeddings.length} párrafos incrustados
                    </div>
                )}
            </div>
    
            <div className="flex flex-col mb-4">
                <label className="text-sm font-medium mb-2">Pregunta</label>
                <input
                    value={question}
                    className="input input-bordered input-secondary w-full mb-4"
                    onChange={(e) => setQuestion(e.target.value)}
                    type="text"
                    placeholder="Introduzca una pregunta sobre el documento (por ejemplo, ¿Cuál es el tema principal del documento?)"
                />
            </div>
    
            <button
                className="btn btn-primary mt-2 mb-4"
                onClick={handleSubmitClick}
            >
            Enviar pregunta
            </button>
            {matchedParagraphs.length > 0 && (
            <div className="my-4">
                <div className="text-lg font-medium">Párrafos coincidentes (3 primeros)</div>
    
                {matchedParagraphs.map((paragraph, idx) => (
                <p
                    className="my-2 text-sm"
                    key={`${idx}-${paragraph.substring(0, 10)}`}
                >
                    {paragraph.substring(0, 100) + "..."}
                </p>
                ))}
            </div>
            )}
            {answer && (
                <div className="my-4">
                    <div className="text-lg font-medium">Respuesta</div>
                    <div>{answer}</div>
                </div>
            )}
    
            {status && <div>{status}</div>}
        </div>
    );
}