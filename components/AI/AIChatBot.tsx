
/* To run this demo yourself:

1. Create a next Next.js app using our starter template by running the following terminal command:

    npx create-next-app my-usellm-app -e https://github.com/usellm/nextjs-starter-template
    cd my-usellm-app # enter the directory

2. Copy the source code of this file & paste it in `app/page.tsx` replacing existing code.
   You can use a code editor like VS Code (https://code.visualdudio.com) to edit the file.

3. Run the development server using `npm run dev` and open http://localhost:3000 in your browser.
   You will now be able to try out this demo. Make changes to the code to see the changes live.

4. (Optional) Replace the `serviceUrl` below with your own service URL for production use.
*/

import { useEffect, useRef, useState } from "react";
import useLLM, { OpenAIMessage } from "usellm";
import { User } from "../../payload-types";

type AIChatBotProps = { 
  user: User
}

export default function AIChatBot({ user }: AIChatBotProps) {

  const [status, setStatus] = useState<Status>("idle");
  const [history, setHistory] = useState<OpenAIMessage[]>([
    {
      role: "assistant",
      content:
      "Soy Profe-bot 🤖 y estoy aqui para ayudarte con tus preguntas. ¿Como te puedo ayudar?",
    },
  ]);
  const [inputText, setInputText] = useState("");

  const llm = useLLM({
    serviceUrl: "https://usellm.org/api/llm", // For testing only. Follow this guide to create your own service URL: https://usellm.org/docs/api-reference/create-llm-service
    // serviceUrl: "/api/llm",
  });

  async function handleSend() {
    if (!inputText) {
      return;
    }
    try {
      setStatus("streaming");
      const newHistory = [...history, { role: "user", content: inputText }];
      setHistory(newHistory);
      setInputText("");
      const { message } = await llm.chat({
        messages: newHistory,
        stream: true,
        onStream: ({ message }) => setHistory([...newHistory, message]),
      });
      setHistory([...newHistory, message]);
      setStatus("idle");
    } catch (error: any) {
      console.error(error);
      window.alert("Something went wrong! " + error.message);
    }
  }

  async function handleRecordClick() {
    try {
      if (status === "idle") {
        await llm.record();
        setStatus("recording");
      } else if (status === "recording") {
        setStatus("transcribing");
        const { audioUrl } = await llm.stopRecording();
        const { text } = await llm.transcribe({ audioUrl });
        setStatus("streaming");
        const newHistory = [...history, { role: "user", content: text }];
        setHistory(newHistory);
        const { message } = await llm.chat({
          messages: newHistory,
          stream: true,
          onStream: ({ message }) => setHistory([...newHistory, message]),
        });
        setHistory([...newHistory, message]);
        setStatus("idle");
      }
    } catch (error: any) {
      console.error(error);
      window.alert("Something went wrong! " + error.message);
    }
  }

  const Icon = status === "recording" ? Square : Mic;

  return (
    <div className="flex flex-col h-full max-h-[600px] overflow-y-hidden">
      <ChatMessages 
        user={user}
        messages={history} />
      <div className="w-full pb-4 flex px-4">
        <ChatInput
          placeholder={getInputPlaceholder(status)}
          text={inputText}
          setText={setInputText}
          sendMessage={handleSend}
          disabled={status !== "idle"}
        />
        <button
          className="btn btn-primary ml-2"
          onClick={handleSend}
        >
          Enviar 
        </button>
        <button
          className="btn btn-secondary ml-2"
          onClick={handleRecordClick}
        >
          <Icon />
        </button>
      </div>
    </div>
  );
}

const Mic = () => (
  // you can also use an icon library like `react-icons` here
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" x2="12" y1="19" y2="22"></line>
  </svg>
);

const Square = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
  </svg>
);

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.substring(1);
}

type Status = "idle" | "recording" | "transcribing" | "streaming";

function getInputPlaceholder(status: Status) {
  switch (status) {
    case "idle":
      return "Preguntame algo...";
    case "recording":
      return "Grabando...";
    case "transcribing":
      return "Transcribiendo...";
    case "streaming":
      return "Espera por mi respuesta...";
  }
}

interface ChatMessagesProps {
  messages: OpenAIMessage[];
  user: User
}

function ChatMessages({ messages, user }: ChatMessagesProps) {
  let messagesWindow = useRef<Element | null>(null);


  useEffect(() => {
    if (messagesWindow?.current) {
      messagesWindow.current.scrollTop = messagesWindow.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      className="w-full flex-1 overflow-y-auto px-4 my-8"
      ref={(el) => (messagesWindow.current = el)}
    >
      {messages.map((message, idx) => (
        <div className={`chat my-2 ${message.role === "user" ? "chat-end" : "chat-start"}`} key={idx}>
          <div className="chat-bubble">
            <div className="font-bold">
              {capitalize(message.role) === 'Assistant' ? 'Profe-bot 🤖' : user.firstName + ' ' + user.lastName}
            </div>
            <div className="mt-1">
              {message.content}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface ChatInputProps {
  placeholder: string;
  text: string;
  setText: (text: string) => void;
  sendMessage: () => void;
  disabled: boolean;
}

function ChatInput({
  placeholder,
  text,
  setText,
  sendMessage,
  disabled,
}: ChatInputProps) {
  return (
    <input
      className="input input-primary input-bordered w-full"
      type="text"
      placeholder={placeholder}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      }}
    />
  );
}
