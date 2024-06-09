'use server'

import { google } from '@ai-sdk/google'
import { createAI, getMutableAIState, streamUI } from 'ai/rsc'
import { nanoid } from 'nanoid'
import { ReactNode } from 'react'
import { z } from 'zod'

import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'

export interface ServerMessage {
    role: 'user' | 'assistant'
    content: string
}

export interface ClientMessage {
    id: string
    role: 'user' | 'assistant'
    display: ReactNode
}

export async function continueConversation (
    input: string
): Promise<ClientMessage> {
    const history = getMutableAIState()

    const result = await streamUI({
        model: google('models/gemini-pro'),
        messages: [...history.get(), { role: 'user', content: input }],
        system: `# You are an expert teacher in python.

        As the expert teacher in python you have left an assignment for your students to complete. The assignment is to write a program that asks the user for their name, age, and favorite color, and then prints out this information. You have provided the students with the following instructions:
        
        **Assignment:** "Get to Know Me" Program
        
        **Objective:** Write a program that asks the user for their name, age, and favorite color, and then prints out this information.
        
        **Instructions:**
        
        1. Create a new Python file called "get_to_know_me.py".
        2. Start by asking the user for their name. Use the "input()" function to get the user's response, and store it in a variable called "name". Make sure to use string data type (e.g., ""John"").
        3. Next, ask the user for their age. Use the "int()" function to convert the user's response into an integer value. Store this value in a variable called "age".
        4. Then, ask the user for their favorite color. Use the "input()" function again, and store the user's response in a variable called "favorite_color". Make sure to use string data type (e.g., ""blue"").
        5. Finally, print out the user's name, age, and favorite color using the following format:
        \`\`\`python
        "My name is {name}, I am {age} years old, and my favorite color is {favorite_color}."
        \`\`\`
        Your Job is to review the code written by the students and provide feedback on their work.
        
        ### You must follow the following guidelines:

        - YOU MUST NOT GIVE FULL ANSWERS TO THE STUDENTS. you must only provide feedback on their work.
        - if the code is not working, provide feedback on the code bugs.
        - Provide any other feedback that you think would be helpful for the students.
        - If the given answer has nothing to do with the question, give appropriate feedback.
        - If the given answer is correct, give appropriate feedback.
        - If the given answer is partially correct, give appropriate feedback.
        - If the given answer is correct but not well explained, give appropriate feedback.
        - you can give hints to the students to help them understand the problem, but only with short and clear messages.
        - you can ask the students to provide more information if needed.
        
        ## Example:

        \`\`\`python

# get_to_know_me.py

# Ask the user for their name

name = input("What is your name? ")

# Ask the user for their age

age = int(input("How old are you? "))

# Ask the user for their favorite color

favorite_color = input("What is your favorite color? ")

# Print out the user's information

print(f"My name is {name}, I am {age} years old, and my favorite color is {favorite_color}.")

\`\`\`


If the student has a code satisfying the requirements of the assignment and working properly, YOU MUST MARK THE ASSIGNMENT AS COMPLETED. to do that you need to call the function \`makeUserAssigmentCompleted\` that way the student assignment will be marked as completed.
DO NOT CALL THE FUNCTION IF THE STUDENT CODE IS NOT WORKING PROPERLY.
        `,
        text: ({ content, done }) => {
            if (done) {
                history.done((messages: ServerMessage[]) => [
                    ...messages,
                    { role: 'assistant', content }
                ])
            }

            return <ViewMarkdown markdown={content} />
        },
        tools: {
            makeUserAssigmentCompleted: {
                description:
        'Function to mark the assignment as completed, you must only call it when the student code is correct and working properly satisfying the requirements of the assignment.',
                parameters: z.object({
                    assignmentId: z.string().describe('The ID of the assignment to mark as completed.')
                }),
                generate: async function ({ assignmentId }) {
                    history.done((messages: ServerMessage[]) => [
                        ...messages,
                        {
                            role: 'assistant',
                            content: 'Congratulations! You have successfully completed the assignment.'
                        }
                    ])

                    return (
                        <div>
                            <div
                                className='text-green-500 bg-green-100 rounded-lg p-4'
                            >Assignment 1 marked as completed.</div>
                        </div>
                    )
                }
            }
        }
    })

    console.log(result)
    console.log(result.rawResponse)

    return {
        id: nanoid(),
        role: 'assistant',
        display: result.value
    }
}

export const AI = createAI<ServerMessage[], ClientMessage[]>({
    actions: {
        continueConversation
    },
    initialAIState: [],
    initialUIState: []
})
