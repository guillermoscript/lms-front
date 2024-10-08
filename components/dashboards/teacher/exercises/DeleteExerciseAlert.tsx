'use client'

import { deleteExerciseAction } from '@/actions/dashboard/exercisesActions'

import DeleteAlert from '../DeleteAlert'

export default function DeleteExerciseAlert ({ exerciseId }: { exerciseId: string }) {
    return (
        <DeleteAlert
            itemId={exerciseId}
            itemType="Exercise"
            deleteAction={async (id: string) => await deleteExerciseAction({ exerciseId: id })}
        />
    )
}
