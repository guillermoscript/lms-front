import dayjs from "dayjs";
import { Course, Evaluation, User } from "../../payload-types";

type ExamnHeroProps = {
    data: Evaluation;
    children: React.ReactNode;
}

export default function ExamnHero({ data, children }: ExamnHeroProps) {

  const course = data.course as Course

  const courseName = course?.name
  const teacherFirstName = (course.teacher as User)?.firstName
  const teacherLastName = (course.teacher as User)?.lastName

    return (
        <div className="hero py-4 px-2 mb-4 bg-base-200 rounded shadow-2xl">
          <div className="hero-content flex-col lg:flex-row-reverse">
            <div>
              <h1 className="text-5xl font-bold">{data.name}</h1>
              <p className="py-6">{data.description}</p>
              <div className="flex flex-row justify-between mb-6">
                <h4 className="text-xl font-bold mb-2">Curso: {courseName}</h4>
                <h4 className="text-xl font-bold mb-2">
                  Profesor: {teacherFirstName} {teacherLastName}
                </h4>
              </div>
              <ul className="flex gap-3 mb-4">
                <li className="mb-2">Fecha de inicio: {dayjs(data.createdAt).format('DD/MM/YYYY')},</li>
                <li className="mb-2">Fecha de finalización: {dayjs(data.endDate).format('DD/MM/YYYY')},</li>
                <li className="mb-2">Maxima puntuación: {data.maxScore}.</li>
              </ul>
              <div className="flex justify-center">
                {children}
              </div>
            </div>
          </div>
        </div>
    )
}