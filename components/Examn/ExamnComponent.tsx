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

    const mutation = useMutationSubmitExamn(handleSuccess)

    
    if (count === 0) {
        return (
            <>
                <h1>
                    Tiempo para iniciar el examen
                </h1>
            </>
        )
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

//     const [intervalValue, setIntervalValue] = useState<number>(1000)
//   const [count, { startCountdown, stopCountdown, resetCountdown }] =
//     useCountdown({
//       countStart: 60,
//       intervalMs: intervalValue,
//     })

//   const handleChangeIntervalValue = (event: ChangeEvent<HTMLInputElement>) => {
//     setIntervalValue(Number(event.target.value))
//   }
//   return (
//     <div>
//       <p>Count: {count}</p>

//       <input
//         type="number"
//         value={intervalValue}
//         onChange={handleChangeIntervalValue}
//       />
//       <button onClick={startCountdown}>start</button>
//       <button onClick={stopCountdown}>stop</button>
//       <button onClick={resetCountdown}>reset</button>
//     </div>
//   )
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