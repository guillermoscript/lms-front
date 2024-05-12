import { deleteLessonsAction } from "@/actions/dashboard/lessonsAction";
import DeleteAlert from "../DeleteAlert";

export default function DeleteLessonAlert({ lessonId }: { lessonId: string }) {
    return (
        <DeleteAlert
            itemId={lessonId}
            itemType="Lesson"
            deleteAction={(id: string) => deleteLessonsAction({ lesonId: id })}
        />
    );
}