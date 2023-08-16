import dayjs from "dayjs";
import { useState, ChangeEvent, useEffect } from "react"
import useMutationSubmitExamn from "./hooks/useMutationSubmitExamn";
import useMutationMarkAsCompleted from "./hooks/useMutationMarkAsCompleted";
import { RichText } from "../RichText";
import BlocksComponent, { FormExamn } from "../Blocks";
import { useCountdown } from "usehooks-ts";

// import useCountdown from "../Countdown/hooks/useCountdown";

export default function ExamnComponent({ data, handleFinishExamn, time, count }: any) {
    
    const mutation2 = useMutationMarkAsCompleted()
    const mutation = useMutationSubmitExamn(handleSuccess)

    async function handleSuccess() {
        mutation2.mutate({
            id: data.id,
        }, {
            onSuccess: () => {
                console.log('success')
                handleFinishExamn()
            },
            onError: (error) => {
                console.log(error)
            }
        })
    }
    
    if (count === 0) {
        return <h1>Tiempo para iniciar el examen</h1>;
    }

    return (
        <>
            <h3 className="text-2xl font-bold">Tiempo restante: {time}</h3>
            <ExamnContent
                data={data}
                mutation={mutation}
            />
        </>
    )
}

function ExamnContent({ data, mutation }: any) {
    return (
        <>
            <RichText content={data.exam[0].content} />
            <BlocksComponent
                callback={mutation.mutate}
                blocks={data.exam[0].formExamn as FormExamn}
            />
        </>
    )
}