function categorizeQuestions(questions: any[]) {
    return questions.reduce((acc, question) => {
        const processedQuestion = {
            id: `q-${question.question_id}`,
            label: question.question_text,
        };

        switch (question.question_type) {
            case "multiple_choice":
                const options = question.question_options.map((option: any) => ({
                    id: `opt-${option.option_id}`,
                    text: option.option_text,
                }));
                acc.multipleChoiceQuestions.push({
                    ...processedQuestion,
                    options: options,
                });
                break;
            case "free_text":
                acc.freeTextQuestions.push({
                    ...processedQuestion,
                    placeholder: "Enter your answer",
                });
                break;
            case "true_false":
                acc.singleSelectQuestions.push(
                    {
                        id: processedQuestion.id + "-true",
                        text: `${processedQuestion.label} (True)`,
                    },
                    {
                        id: processedQuestion.id + "-false",
                        text: `${processedQuestion.label} (False)`,
                    }
                );
                break;
            default:
                break;
        }
        return acc;
    }, {
        multipleChoiceQuestions: [],
        freeTextQuestions: [],
        singleSelectQuestions: [],
    });
}

export default categorizeQuestions;