// app/api/chatbox-api/route.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

interface RequestBody {
  message: string;
  instructions: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const reqBody: RequestBody = await request.json();
    const { message, instructions } = reqBody;

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: `Act like a teacher. Always provide responses in plain text without using any markdown or special formatting like **, _ or other font styles. Respond naturally and clearly.
        ${instructions}`, 
    });

    console.log("instrucciones", instructions);

    const generationConfig = {
      temperature: 0.7,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 256,
      responseMimeType: "text/plain",
    };

    const chatSession = model.startChat({
      generationConfig,
      history: [],
    });

    const result = await chatSession.sendMessage(message);
    const responseText = result.response.text();

    return NextResponse.json({ message: responseText });
  } catch (error) {
    console.error("Error al generar la respuesta:", error);
    return NextResponse.json(
      { message: "Error al procesar la solicitud" },
      { status: 500 }
    );
  }
}