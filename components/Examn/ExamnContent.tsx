import dayjs from 'dayjs';
import BlocksComponent, { FormExamn } from '../Blocks';
import CountdownTimer from '../Countdown/Countdown';
import { RichText } from '../RichText';
import useMutationMarkAsCompleted from './hooks/useMutationMarkAsCompleted';
import { useAuth } from '../Auth';
import useMutationSubmitExamn from './hooks/useMutationSubmitExamn';
import { useState } from 'react';

type ExamnContentProps = {
    data: any;
    setIsCompletedByUser: (value: boolean) => void;
}

export default function ExamnContent({ data, setIsCompletedByUser }: ExamnContentProps) {

    const mutation2 = useMutationMarkAsCompleted()
    async function handleSuccess() {
        mutation2.mutate({
            id: data.id,
        }, {
            onSuccess: () => {
                console.log('success')
                setIsCompletedByUser(true)
            },
            onError: (error) => {
                console.log(error)
            }
        })
    }

    const mutation = useMutationSubmitExamn(handleSuccess)
    const getTimeToStart = () => {
        const timeToAdd = data.exam[0].timeToAnswer;
        const newEndDate = dayjs().add(timeToAdd, 'minute').toDate().getTime();
        return newEndDate;
    };

    return (
        <>
            <CountdownTimer
                targetDate={getTimeToStart()}>
                <RichText content={data.exam[0].content} />
                <BlocksComponent
                    callback={mutation.mutate}
                    blocks={data.exam[0].formExamn as FormExamn}
                />
            </CountdownTimer>
            {mutation.isSuccess && (
                <div>
                    <h1 className="text-5xl font-bold">Tu examen ha sido enviado</h1>
                </div>
            )}
            {mutation.isError && (
                <div>
                    <h1 className="text-5xl font-bold">Ha ocurrido un error al enviar tu examen, por favor contacta a tu profesor</h1>
                </div>
            )}
        </>
    );
}
