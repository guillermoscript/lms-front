// types.ts

export interface Option {
    id: string;
    text: string;
}



export interface MultipleChoiceQuestion {
    id: string;
    label: string;
    options: Option[];
}



export interface FreeTextQuestion {
    id: string;
    label: string;
    placeholder: string;
}



export interface SingleSelectQuestion {
    id: string;
    text: string;
}


export interface StudentExamSubmitFormData {
    [key: string]: string | string[] | boolean;
}