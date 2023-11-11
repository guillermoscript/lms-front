import { atom } from "jotai";

export const types = ["GPT-3", 'GPT-4'] as const

export type ModelType = (typeof types)[number]

export interface Model<Type = string> {
    id: string
    name:
    | 'gpt-4'
    | 'gpt-4-0314'
    | 'gpt-4-0613'
    | 'gpt-4-32k'
    | 'gpt-4-32k-0314'
    | 'gpt-4-32k-0613'
    | 'gpt-3.5-turbo'
    | 'gpt-3.5-turbo-16k'
    | 'gpt-3.5-turbo-0301'
    | 'gpt-3.5-turbo-0613'
    | 'gpt-3.5-turbo-16k-0613';
    description: string
    strengths?: string
    type: Type
    length: number

}

export const models: Model<ModelType>[] = [
    {
        id: "be638fb1-973b-4471-a49c-290325085803",
        name: "gpt-3.5-turbo-16k",
        description:
            "All-around model, capable of most tasks, but not the best at any. Limit of 16,384 tokens.",
        type: "GPT-3",
        strengths:
            "Parsing text, simple classification, address correction, keywords",
        length: 16384
    },
    {
        id: "c305f976-8e38-42b1-9fb7-d21b2e34f0da",
        name: "gpt-4",
        description:
            "The most capable model, but also the slowest and most expensive.",
        type: "GPT-4",
        strengths:
            "Language translation, complex classification, sentiment, summarization, complex semantic search",
        length: 8191
    },
    {
        id: "464a47c3-7ab5-44d7-b669-f9cb5a9e8465",
        name: "gpt-4-0314",
        description: "Capable of straightforward tasks, very fast.",
        type: "GPT-4",
        strengths:
            "Language translation, complex classification, sentiment, summarization, complex semantic search",
        length: 8191
    },
    {
        id: "ac0797b0-7e31-43b6-a494-da7e2ab43445",
        name: "gpt-4-0613",
        description: "Capable of straightforward tasks, very fast, and lower cost.",
        type: "GPT-4",
        strengths: "Language translation, complex classification, sentiment, summarization, complex semantic search",
        length: 8191
    },
    {
        id: "be638fb1-973b-4471-a49c-290325085802",
        name: "gpt-3.5-turbo",
        description:
            "All-around model, capable of most tasks, but not the best at any. Limit of 2048 tokens.",
        type: "GPT-3",
        strengths:
            "Parsing text, simple classification, address correction, keywords",
        length: 4096
    },
]

export type ModelStore = {
    maxLength: number
    temperature: number
    selectedModel: Model
}

export const maxLengthAtom = atom<number[]>([256])
export const temperatureAtom = atom<number[]>([0.7])
export const selectedModelAtom = atom<Model>(models[0])

export const modelStore = atom(
    (get) => {
        const maxLength = get(maxLengthAtom)
        const temperature = get(temperatureAtom)
        const selectedModel = get(selectedModelAtom)

        return {
            maxLength,
            temperature,
            selectedModel
        }
    }
)