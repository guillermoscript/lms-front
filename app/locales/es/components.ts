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
    },
    ChatOptionsShowcase: {
        title: 'Experimenta nuestras opciones de chat versátiles',
        tabs: {
            code: 'Profesor de código',
            english: 'Profesor de inglés',
            spanish: 'Profesor de español',
            englishSpeech: 'Profesor de inglés (habla)',
            codeTask: '**Escribe un programa en Python que haga lo siguiente:**\n\n- Pide al usuario que introduzca su nombre.\n- Pide al usuario que introduzca su edad.\n- Imprime un mensaje de saludo personalizado que incluya su nombre y edad.\n- Dile al usuario cuántos años faltan para que cumpla 100 años.\nSi te sientes perdido, por favor pídele ayuda a la IA',
            englishTask: `**Tarea: Mi comida favorita**

**Objetivo:** Practicar la escritura de oraciones simples en inglés.

**Instrucciones:**

1. **Escribe un párrafo en Inglés sobre tu comida favorita**
    - Por favor, escribe un párrafo corto (5-7 oraciones) sobre tu comida favorita. Responde las siguientes preguntas en tu párrafo:
        - ¿Cuál es tu comida favorita?
        - ¿Por qué te gusta?
        - ¿Cuándo sueles comerla?
        - ¿Con quién disfrutas comiéndola?

2. **Ejemplo de cómo escribir tu párrafo:**
    \`\`\`
    Mi comida favorita son los tacos. Me gustan los tacos porque son sabrosos y versátiles. Suelo comer tacos los fines de semana con mis amigos. Disfrutamos de diferentes rellenos como carne de res, pollo y verduras. ¡Hacer tacos juntos es divertido! Me encanta agregar salsa picante a mis tacos.
    \`\`\`

            `,
            spanishTask: `**Tarea: Mi Pasatiempo Favorito**

**Objetivo:** Practicar la escritura de oraciones simples en español.

**Instrucciones:**

1. **Escribe un párrafo en español sobre tu pasatiempo favorito**
   - Escribe un párrafo corto (5-7 oraciones) sobre tu pasatiempo favorito. Responde las siguientes preguntas en tu párrafo:
     - ¿Cuál es tu pasatiempo favorito?
     - ¿Por qué te gusta?
     - ¿Cuándo sueles hacerlo?
     - ¿Con quién te gusta practicarlo?

2. **Ejemplo de cómo escribir tu párrafo:**
   \`\`\`
   Mi pasatiempo favorito es la lectura. Me gusta leer porque me permite viajar a otros mundos. Suelo leer por la tarde, cuando tengo tiempo libre. A veces, leo con mis amigos en la biblioteca. Disfrutamos compartir nuestras historias favoritas. La lectura es una manera divertida de aprender.
   \`\`\``,
            englishSpeechTask: `## Profesor de inglés (habla)
Por favor, habla en inglés, la IA te ayudará dándote retroalimentación sobre la conversación.
\n**Cosas que puedes hacer:**
- Hablar sobre tus pasatiempos, la IA te continuará la conversación.
- Hablar sobre tus comidas favoritas, la IA te continuará la conversación y te dará retroalimentación.
- Preguntar dudas sobre gramática, la IA te ayudará a resolver tus dudas.
- Preguntar sobre ejercicios de vocabulario, la IA te creara ejercicios para practicar.
- Dar un discurso, la IA te dará retroalimentación sobre tu discurso.

# IMPORTANTE
### Solo habla en inglés, la IA no entenderá otros idiomas.

Si tienes dudas, intenta diciendo: "Could you give me a fake scenario to practice my speaking?"`,
        },
    },
    EnhancedVoiceAIChat: {
        status: {
            inactive: 'inactivo',
            active: 'activo',
            loading: 'cargando',
            oneSecond: 'Un segundo...',
            trialEnded: 'Tu prueba ha terminado',
        },
        statusMessage: {
            giveItATry: '¡Inténtalo!',
            justTalk: 'Solo habla',
            aiIsSpeaking: 'La IA está hablando...',
            aiFinishedSpeaking: 'La IA ha terminado de hablar',
            errorOccurred: 'Se ha producido un error. Inténtalo de nuevo.',
            stopping: 'Deteniendo...',
            oneSecond: 'Un segundo...',
        },
        callStatus: {
            inactive: 'inactivo',
            active: 'activo',
            loading: 'cargando',
        },
        earlyAccess: 'Para seguir utilizando el servicio, asegúrate de suscribirte a nuestro programa de acceso anticipado.',
        subscribe: '¡Suscríbete ahora!',
    },
    SuccessMessage: {
        status: '¡Éxito!',
        message: 'Tarea marcada como completada.',
    },
} as const
