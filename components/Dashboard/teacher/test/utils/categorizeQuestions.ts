function categorizeQuestions(questions: any[]) {
    return questions.reduce(
        (acc, question) => {
            const localData = question.test_question_localizations[0]; // Using the first localization for simplicity
            if (localData) {
                const processedQuestion = {
                    id: `q-${question.id}`,
                    label: localData.question_text,
                };

                switch (question.question_type) {
                    case "multiple_choices":
                        const options = question.question_options.map((option: any) => {
                            const optionLocal = option.question_option_localizations.find((loc: any) => loc.language_code === 'en');
                            return {
                                id: `opt-${option.id}`,
                                text: optionLocal.option_text,
                            };
                        });
                        acc.multipleChoiceQuestions.push({
                            ...processedQuestion,
                            options: options,
                        });
                        break;
                    case "fill_in":
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
            }
            return acc;
        },
        {
            multipleChoiceQuestions: [],
            freeTextQuestions: [],
            singleSelectQuestions: [],
        }
    );
};

export default categorizeQuestions;