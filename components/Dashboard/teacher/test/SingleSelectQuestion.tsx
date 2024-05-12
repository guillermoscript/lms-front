// SingleSelectQuestion.tsx
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

import React from 'react';

type Props = {
    questions: { id: string; text: string }[];
};

const SingleSelectQuestion: React.FC<Props> = ({ questions }) => (
    <div className="space-y-2 mt-2">
        {questions?.map((question) => (
            <div key={question.id} className="flex items-center gap-2">
                <Checkbox id={question.id} />
                <Label htmlFor={question.id}>{question.text}</Label>
            </div>
        ))}
    </div>
);

export default SingleSelectQuestion;