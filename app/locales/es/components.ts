export default {
    courseSectionComponent: {
        title: 'Tus Cursos'
    },
    bookingSection: {
        enrollAndViewLessons: 'Inscribirse y Ver lecciones',
        viewLessons: 'Ver lecciones',
        enrollAndViewExams: 'Inscribirse y Ver exámenes',
        viewExams: 'Ver exámenes',
        loading: 'Cargando...',
        errorEnrollingUser: 'Error al inscribir al usuario'
    },
    BreadcrumbComponent: {
        dashboard: 'Tablero',
        student: 'Estudiante',
        course: 'Cursos',
        lesson: 'Lecciones',
        exam: 'Exámenes',
        review: 'Reseñas',
    },
    RecentlyViewed: {
        title: 'Visto recientemente',
        noViews: 'Aún no hay vistas',
        viewAll: 'Ver todo',
        viwedOn: 'Visto el',
        continueReading: 'Continuar leyendo'
    },
    ChatsSectionComponent: {
        freeChat: 'Chat libre',
        examPrep: 'Preparación para el examen',
        title: 'Tus chats'
    },
    SidebarLessons: {
        comments: 'Comentarios',
        timeline: 'Línea de tiempo',
        tableOfContents: 'Tabla de contenido',
        reviews: 'Reseñas'
    },

    CommentsSections: {
        title: 'Comentarios',
        CardTitle: 'Agregar un comentario',
        CommentCard: {
            cancel: 'Cancelar',
            reply: 'Responder',
            viewReplies: 'Ver respuestas',
        },
        CommentEditor: {
            toast: {
                titleError: 'Error',
                titleSuccess: 'Éxito',
                messageError: 'Error al agregar comentario',
                messageSuccess: 'Comentario agregado con éxito',
            },
            action: 'Enviar comentario',
        }
    },
    LessonContent: {
        video: 'Video',
        summary: 'Resumen',
        aiTask: 'Tarea de IA',
        aiTaskCompleted: 'Tarea de IA completada',
        aiTaksInComplete: 'Tarea incompleta',
        RetryError: {
            title: 'Error al cargar la tarea de IA',
            description: 'Hubo un problema al cargar la tarea de IA'
        },
        ResetTaskAIConversation: {
            button: 'Restablecer la conversación de la tarea de IA',
            title: '¿Estás seguro de que quieres restablecer la conversación de la tarea de IA?',
            description: 'Esto restablecerá la conversación de la tarea de IA y perderás todo el progreso.',
            cancel: 'Cancelar',
            loading: 'Cargando...',
            action: 'Restablecer conversación',
        }
    },
    AiTaskMessage: {
        title: 'Completa tu tarea',
        simple: 'Simple',
        markdown: 'Markdown',
        status: 'Éxito',
    },
    ChatInput: {
        templateExamForm: 'Formulario de examen de plantilla',
        templateForQuestion: 'Plantilla para generar una pregunta para un tema "X"',
        placeholder: 'Escribe tu mensaje aquí...',
        send: 'Enviar',
        stop: 'Detener'
    },
    DisclaimerForUser: {
        text: 'Las IA pueden cometer errores. Por favor, verifica informacion importante.'
    },
    ChatTextArea: {
        placeholder: 'Escribe tu mensaje aquí...',
        send: 'Enviar',
        stop: 'Detener'
    },
    MessageFeatureSection: {
        tooltipContentEdit: 'Editar mensaje',
        tooltipContentView: 'Volver al modo de vista',
        tooltipContentRegenerate: 'Regenerar mensaje'
    },
    EditMessage: {
        simple: 'Simple',
        markdown: 'Markdown',
        editAndRegenerate: 'Editar y regenerar respuesta de IA',
        edit: 'Editar'
    },
    TimelineItem: {
        current: 'Actual'
    },
    TableOfContents: {
        title: 'Tabla de contenido'
    },
    ListOfReviews: {
        noReviews: 'Aún no hay reseñas, sé el primero en escribir una',
    },
    ReviewForm: {
        rating: 'Calificación',
        'stars#zero': 'Estrellas',
        'stars#one': 'Estrella',
        'stars#other': 'Estrellas',
        review: 'Reseña',
        reviewDescription: 'Escribe tu reseña aquí...',
        toast: {
            titleError: 'Error',
            titleSuccess: 'Éxito',
            messageError: 'Error al agregar reseña',
            messageSuccess: 'Tu reseña ha sido agregada a la lección.'
        },
        action: 'Enviar reseña'
    },
    ExamsSubmissionForm: {
        trueOrFalse: 'Verdadero o Falso',
        freeText: 'Pregunta abierta',
        multipleChoice: 'Selección múltiple',
        submit: 'Enviar examen',
        alert: {
            title: '¿Estás seguro de que quieres enviar el examen?',
            description: 'Una vez que envíes el examen, no podrás cambiar tus respuestas.',
            cancel: 'Cancelar',
            submit: 'Enviar'
        },
    },
    AiReview: {
        title: 'Revisión de IA',
        description: 'Esta es la revisión de IA de tu examen, no es final y es solo para tu referencia sobre cómo lo hiciste. Por favor, espera la revisión final de tu profesor.',
        noReview: 'Aún no hay revisiones',
        overallReview: 'Revisión general de IA:'
    }
} as const
