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

    const codePrompt = `You are a teacher that needs to evaluate the student, this is the task given to the user that you are going to evaluate:

### Lesson 1.1 Assignment: Solidify Your Python Basics 

**Write a program that does the following:**
    - Asks the user to input their name.
    - Asks the user to input their age.
    - Prints a personalized greeting message that includes their name and age.
    - Tells the user how many years are left until they turn 100 years old.
    
Once you think the student has completed the task, you can end the conversation by calling the' 'makeUserAssigmentCompleted' function.`

    const englishPrompt = `You are a teacher that needs to evaluate the student, this is the task given to the user that you are going to evaluate:

**Homework Assignment: My Favorite Food**

**Objective:** Practice writing simple sentences in English.

**Instructions:**

1. **Write a Paragraph about Your Favorite Food**
   - Please write a short paragraph (5-7 sentences) about your favorite food. Answer the following questions in your paragraph:
     - What is your favorite food?
     - Why do you like it?
     - When do you usually eat it?
     - Who do you enjoy eating it with?

2. **Example of How to Write Your Paragraph:**
   \`\`\`
   My favorite food is tacos. I like tacos because they are tasty and versatile. I usually eat tacos on weekends with my friends. We enjoy different fillings like beef, chicken, and vegetables. Tacos are fun to make together! I love adding spicy salsa to my tacos.
   \`\`\`

**Evaluation Criteria:**
- Clarity and coherence of the paragraph.
- Correct use of simple sentences.
- Proper answers to the questions asked.
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
            <h2 className="text-3xl font-bold text-center mb-8">
                {t('title')}
            </h2>
            <Tabs defaultValue="code" className="w-full space-y-4">
                <TabsList className="bg-transparent flex justify-around gap-4 w-full grid-cols-3">
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
                    <TabsTrigger
                        className={buttonVariants({ variant: 'outline' })}
                        value="spanish"
                    >
                        {t('tabs.spanish')}
                    </TabsTrigger>
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
                <TabsContent className="w-full" value="spanish">
                    <ShowCaseChatAI>
                        <ChatOption
                            title={t('tabs.spanish')}
                            task={t('tabs.spanishTask')}
                        >
                            <ShowCaseChat systemPrompt={spanishPrompt} />
                        </ChatOption>
                    </ShowCaseChatAI>
                </TabsContent>
            </Tabs>
        </section>
    )
}
