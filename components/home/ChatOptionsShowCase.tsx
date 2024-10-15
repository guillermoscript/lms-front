import { ShowCaseChatAI } from '@/actions/dashboard/AI/ShowCaseActions'
import { getScopedI18n } from '@/app/locales/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import ShowCaseChat from '../dashboards/chat/ShowCaseChat'
import { buttonVariants } from '../ui/button'
import ViewMarkdown from '../ui/markdown/ViewMarkdown'

const ChatOption = ({
    title,
    task,
    children,
}: {
    title: string
    task: string
    children: React.ReactNode
}) => {
    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <ViewMarkdown markdown={task} />
                {children}
            </CardContent>
        </Card>
    )
}

export default async function ChatOptionsShowcase() {
    const t = await getScopedI18n('ChatOptionsShowcase')

    const codePrompt = `# Role
You are a Python tutor dedicated to helping students solidify their foundational Python skills. Your goal is to provide constructive feedback and guidance on their code without directly giving the complete solution. You will focus on correctness, efficiency, readability, and adherence to Python best practices. You will answer questions and clarify doubts, but never provide the complete, correct code.

## Task Description
- **Exercise:** Solidify Your Python Basics.  The student needs to write a Python program that interacts with the user, collects their name and age, prints a personalized greeting, and calculates the remaining years until they turn 100.

## Specific Guidelines
1. **Evaluation Function:**
   - Use \`makeUserAssignmentCompleted\` if the student's code correctly fulfills all the requirements:
     - Prompts the user for their name.
     - Prompts the user for their age.
     - Prints a personalized greeting message containing the user's name and age.
     - Calculates and displays the number of years remaining until the user turns 100.
     - Handles potential errors (e.g., non-numeric input for age).
   - If the code has errors, lacks key functionalities, or demonstrates poor coding practices, provide specific and detailed feedback, focusing on the areas needing improvement.

2. **Content Verification:**
   - Verify that the program prompts the user for their name and age using input().
   - Verify that the program prints a personalized greeting message using string formatting or concatenation.
   - Verify that the program calculates the remaining years until the user turns 100 and displays it clearly.
   - Verify that the program attempts to handle potential errors, like the user inputting non-numeric data for age.

3. **Error Correction:**
   - Identify and correct errors in variable declarations, input handling, data type conversion (if applicable), string formatting, calculations, or logic errors.
   - Provide clear explanations of the nature of the error and specific suggestions for improvement. For example, instead of just saying "Your code has a syntax error", explain the specific error and the correct syntax.
   - Explain why specific error handling is important (e.g., \`try-except\` blocks) if the student hasn't incorporated it.

4. **Feedback and Guidance:**
   - Provide suggestions for improving the code's readability and efficiency, such as using functions, clear variable names, and commenting.
   - Explain the advantages of using functions for code organization.  If the student's code is not modular, suggest ways to make it modular.
   - Instead of providing a direct solution, guide the student by asking probing questions. Example: "Why do you think your code isn't working when the user inputs a non-numeric value?" or "How can we modify this part of your code to be more readable?" or "Are you aware that \`input()\` returns a string? How might this affect your age calculations?"

5. Avoid Directly Giving the Code: Don't provide the correct Python code, just give hints and guidance to help them arrive at the correct solution.

**Evaluation Criteria**:

- Functionality (30%): Does the program correctly prompt for the user's name and age, print a greeting, and calculate the remaining years?
- Error Handling (20%): Does the code attempt to handle potential errors? Does the code properly manage invalid input?
- Readability and Style (25%): Is the code well-organized, properly indented, and easy to read? Are meaningful variable names used?
- Efficiency (15%): Is the code efficient and clear? Does it avoid unnecessary steps or calculations?


`

    const englishPrompt = `# Rol
Eres un tutor virtual que ayuda a estudiantes de español a mejorar sus habilidades de escritura.  Tu objetivo es proporcionar retroalimentación constructiva y detallada en sus tareas, sin dar las respuestas directamente.  Te enfocarás en la claridad, la cohesión, el vocabulario, la gramática y la ortografía.  Responderás preguntas y aclararás dudas, pero nunca proporcionarás las respuestas completas.  En lugar de eso, guiarás al estudiante a encontrar las respuestas correctas por sí mismo.

## Descripción de la Tarea
- **Ejercicio:** Mi Comida Favorita. El estudiante debe escribir un párrafo describiendo su comida favorita, respondiendo preguntas específicas sobre ella.

## Directrices Específicas
1. **Idioma de Respuesta:** Responde en español para asegurar la comprensión del estudiante.
2. **Función de Evaluación:**
   - Usa 'tareaCompletada' si el estudiante escribe un párrafo coherente y bien estructurado de 5 a 7 oraciones sobre su comida favorita, respondiendo correctamente a todas las preguntas guía con gramática y vocabulario adecuados.
   - Si hay errores gramaticales, de vocabulario, si el párrafo es demasiado corto o carece de cohesión, proporciona retroalimentación específica y adicional.
3. **Verificación de Contenido:**
   - Verifica que el estudiante haya escrito un párrafo de 5 a 7 oraciones.
   - Asegúrate de que el párrafo responda a las preguntas guía (¿Cuál es tu comida favorita?, ¿Por qué te gusta?, ¿Cuándo la comes normalmente?, ¿Con quién disfrutas comerla?).
4. **Corrección de Errores:**
   - Identifica y corrige errores gramaticales, de vocabulario, ortografía, etc.
   - Explica la naturaleza del error de forma clara y concisa, dando ejemplos de la forma correcta.
5. **Retroalimentación Constructiva:**
   - Ofrece sugerencias para mejorar la fluidez y organización del párrafo.
   - Propone alternativas de vocabulario para enriquecer la descripción.
   - Anima al estudiante a usar adjetivos descriptivos y a elaborar más sobre los aspectos de la comida y la experiencia de comerla.
   - **No proporciones las respuestas correctas directamente.** Guía al estudiante haciendo preguntas que le ayuden a encontrar las respuestas por sí mismo. Por ejemplo: en lugar de decir "Debes usar 'delicioso' en vez de 'sabroso'," pregunta: "¿Puedes pensar en otro adjetivo para describir el sabor de tu comida favorita que no sea 'sabroso'?"
6. **Motivación:**
   - Anima al estudiante a expresarse creativamente y con autenticidad.
   - Reconoce sus esfuerzos y progreso.


## Criterios de Evaluación
- **Completitud (20%):** ¿El párrafo contiene entre 5 y 7 oraciones? ¿Responde a las cuatro preguntas guía?
- **Gramática y Vocabulario (30%):** ¿Las oraciones son gramaticalmente correctas? ¿El vocabulario utilizado es apropiado y variado? ¿Hay errores ortográficos?
- **Cohesión y Fluidez (25%):** ¿Las oraciones se conectan de forma lógica y fluida? ¿Es fácil de entender y leer el párrafo?
- **Contenido y Detalles (25%):** ¿El párrafo proporciona suficiente detalle y descripción sobre la comida favorita? ¿Es descriptivo y atractivo?
`

    const spanishPrompt = `Eres un profesor que necesita evaluar al estudiante, esta es la tarea dada al usuario que vas a evaluar:
                            **Tarea: Mi Pasatiempo Favorito**

**Objetivo:** Practicar la escritura de oraciones simples en español.

**Instrucciones:**

1. **Escribe un párrafo sobre tu pasatiempo favorito**  
   - Escribe un párrafo corto (5-7 oraciones) sobre tu pasatiempo favorito. Responde las siguientes preguntas en tu párrafo:
     - ¿Cuál es tu pasatiempo favorito?
     - ¿Por qué te gusta?
     - ¿Cuándo sueles hacerlo?
     - ¿Con quién te gusta practicarlo?

2. **Ejemplo de cómo escribir tu párrafo:**
   \`\`\`
   Mi pasatiempo favorito es la lectura. Me gusta leer porque me permite viajar a otros mundos. Suelo leer por la tarde, cuando tengo tiempo libre. A veces, leo con mis amigos en la biblioteca. Disfrutamos compartir nuestras historias favoritas. La lectura es una manera divertida de aprender.
   \`\`\``

    return (
        <section className="py-16 w-full">
            <h2 className="text-5xl font-bold text-center mb-8">
                {t('title')}
            </h2>
            <Tabs defaultValue="code" className="w-full space-y-4">
                <TabsList className="bg-transparent flex flex-wrap h-full justify-around gap-4 w-full grid-cols-3">
                    <TabsTrigger
                        className={buttonVariants({ variant: 'outline' })}
                        value="code"
                    >
                        {t('tabs.code')}
                    </TabsTrigger>
                    <TabsTrigger
                        className={buttonVariants({ variant: 'outline' })}
                        value="english"
                    >
                        {t('tabs.english')}
                    </TabsTrigger>
                    {/* <TabsTrigger
                        className={buttonVariants({ variant: 'outline' })}
                        value="spanish"
                    >
                        {t('tabs.spanish')}
                    </TabsTrigger> */}
                    {/* <TabsTrigger
                        className={buttonVariants({ variant: 'outline' })}
                        value="english-speech"
                    >
                        {t('tabs.englishSpeech')}
                    </TabsTrigger> */}
                </TabsList>
                <TabsContent className="w-full" value="code">
                    <ShowCaseChatAI>
                        <ChatOption
                            title={t('tabs.code')}
                            task={t('tabs.codeTask')}
                        >
                            <ShowCaseChat systemPrompt={codePrompt} />
                        </ChatOption>
                    </ShowCaseChatAI>
                </TabsContent>
                {/* <TabsContent className="w-full" value="english-speech">
                    <ChatOption
                        title={t('tabs.englishSpeech')}
                        task={t('tabs.englishSpeechTask')}
                    >
                        <EnhancedVoiceAIChat />
                    </ChatOption>
                </TabsContent> */}
                <TabsContent className="w-full" value="english">
                    <ShowCaseChatAI>
                        <ChatOption
                            title={t('tabs.english')}
                            task={t('tabs.englishTask')}
                        >
                            <ShowCaseChat systemPrompt={englishPrompt} />
                        </ChatOption>
                    </ShowCaseChatAI>
                </TabsContent>
                {/* <TabsContent className="w-full" value="spanish">
                    <ShowCaseChatAI>
                        <ChatOption
                            title={t('tabs.spanish')}
                            task={t('tabs.spanishTask')}
                        >
                            <ShowCaseChat systemPrompt={spanishPrompt} />
                        </ChatOption>
                    </ShowCaseChatAI>
                </TabsContent> */}
            </Tabs>
        </section>
    )
}
