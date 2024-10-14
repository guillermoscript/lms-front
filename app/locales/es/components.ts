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
        chat: 'Chat',
        teacher: 'Profesor',
        edit: 'Editar',
        exercise: 'Ejercicios',
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
        edit: 'Editar',
        delete: 'Eliminar',
        reply: 'Responder',
        comments: 'Comentarios',
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
            action: 'Reiniciar tarea de IA'
        },
        TaksMessages: {
            title: 'Completa tu tarea',
            simple: 'Simple',
            markdown: 'Editor Avanzado',
            status: 'Éxito',
        }
    },
    AiTaskMessage: {
        title: 'Completa tu tarea',
        simple: 'Simple',
        markdown: 'Editor Avanzado',
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
        markdown: 'Editor Avanzado',
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
    SubscribeNow: {
        title: '¡Suscríbete ahora!',
        description: 'Para seguir utilizando el servicio, asegúrate de suscribirte a nuestro programa de acceso anticipado.',
    },
    FreeChatSetup: {
        freeChat: {
            title: 'Chat libre',
            description: 'Aquí es donde puedes chatear con el asistente de IA. Puedes hacer preguntas, obtener sugerencias y más.',
        },

        examPrep: {
            title: 'Preparación para el examen',
            description: 'Aquí es donde puedes prepararte para tus exámenes, la IA creará formularios para que los completes y obtengas comentarios sobre tus respuestas.',
        },
        quizMe: {
            title: 'Evaluame',
            description: 'Aquí es donde puedes hacer preguntas y obtener sugerencias sobre qué hacer a continuación. La IA te guiará sobre qué hacer a continuación.',
        },
        suggestions: {
            title: 'Sugerencias',
            description: 'Aquí es donde puedes obtener sugerencias sobre qué hacer a continuación. La IA te guiará sobre qué hacer a continuación.',
        },
        editor: {
            title: 'Editor',
            description: 'Aquí es donde puedes escribir código, markdown o cualquier otro texto. La IA te ayudará con tu código, markdown o texto.',
        },
        title: 'Tutorial guiado',
        description: 'Si deseas saber más sobre el chat libre, haz clic en el botón de arriba para comenzar el recorrido.',
    },
    ExamLink: {
        title: 'Exámenes',
        description: 'Aquí es donde puedes ver tus exámenes y comenzar a hacerlos. La IA te dará comentarios sobre tus respuestas.',
    },
    EmptyChatState: {
        title: 'Pregúntame cualquier cosa, ¡estoy aquí para ayudarte!',
    },
    GenericError: {
        tile: '¡Oh no! Ocurrió un error',
        description: 'Ocurrió un error al cargar la página. Por favor, intenta nuevamente. Si el problema persiste, contacta al soporte.',
    },
    SearchChats: {
        input: 'Escribe aquí para buscar tus chats...',
        empty: 'No se encontraron resultados',
        freeChat: 'Chat libre',
        examPrep: 'Preparación para el examen',
    },
    StudentCreateNewChat: {
        title: 'Chat sin titulo',
        newChat: 'Nuevo chat',
    },
    courseCols: {
        title: 'Título',
        description: 'Descripción',
        status: 'Estado',
        date: 'Fecha',
        actions: 'Acciones',
    },
    CreateCourse: {
        title: 'Crear un nuevo curso',
        actionButton: 'Crear curso',
        dialogTitle: 'Crear un nuevo curso',
        form: {
            title: 'Título',
            description: 'Descripción',
            thumbnail: 'Miniatura',
            tags: 'Tags',
            category: 'Categoría',
            product: 'Producto',
        }
    },
    SelectStatus: {
        status: 'Estado',
        placeholder: 'Seleccionar estado',
        draft: 'Borrador',
        published: 'Publicado',
        archived: 'Archivado',
    },
    DeleteAlert: {
        title: '¿Estás seguro de que quieres eliminar esto?',
        description: 'Esta acción no se puede deshacer.',
        cancel: 'Cancelar',
        delete: 'Eliminar',
    },
    DeleteCourseAlert: {
        course: 'Curso'
    },
    lessonsCols: {
        id: 'ID',
        title: 'Titulo',
        description: 'Descripción',
        sequence: 'Secuencia',
        date: 'Fecha',
        actions: 'Acciones',
    },
    LessonForm: {
        title: 'Título',
        description: 'Descripción',
        sequence: 'Secuencia',
        videoUrl: 'URL del video',
        embed: 'Incrustar',
        image: 'Imagen',
        status: 'Estado',
        statusOptions: {
            draft: 'Borrador',
            published: 'Publicado',
            archived: 'Archivado'
        },
        cardTitle: 'Contenido de la lección',
        systemPromptTitle: 'Sistema de sugerencias',
        taskInsturctionsTitle: 'Instrucciones de la tarea',
        systemPromptDescription: 'Sistema de sugerencias para la lección',
        taskInstructionsDescription: 'Instrucciones para la tarea de la lección',
        form: {
            title: 'Título',
            description: 'Descripción',
            sequence: 'Secuencia',
            videoUrl: 'URL del video',
            embed: 'Incrustar',
            image: 'Imagen',
            status: 'Estado',
            systemPrompt: 'Sistema de sugerencias',
            statusOptions: {
                draft: 'Draft',
                published: 'Published',
                archived: 'Archived',
            },
        }
    },
    TeacherTestForm: {
        edit: 'Editar',
        create: 'Crear',
        form: {
            testName: 'Nombre del examen',
            testDescription: 'Descripción del examen',
            sequence: 'Secuencia',
            exam_date: 'Fecha del examen',
            duration: 'Duración (minutos)',
            status: 'Estado',
            statusOptions: {
                draft: 'Borrador',
                published: 'Publicado',
                archived: 'Archivado'
            },
            update: 'Actualizar',
            create: 'Crear',
        },
        card: {
            title: 'Preguntas',
            description: 'Agrega preguntas al examen',
        }
    },
    TestSubmissionReview: {
        studentAnswer: 'Respuesta del estudiante',
        feedback: 'Retroalimentación',
        score: 'Puntuación',
        correct: 'Correcto',
        overallFeedback: 'Retroalimentación general',
    },
    CourseDashboard: {
        yourCourses: 'Tus Cursos',
        searchCourses: 'Buscar Cursos',
        inProgress: 'En Progreso',
        completed: 'Completado',
        allCourses: 'Todos los Cursos',
        lessons: 'Lecciones',
        exams: 'Exámenes',
        continueCourse: 'Continuar Curso',
        noCoursesFound: 'No se encontraron cursos',
    },
    StudentDashboard: {
        welcome: '¡Bienvenido, Estudiante!',
        dashboardDescription: 'Aquí tienes una visión general de tus cursos y actividades.',
        totalCourses: 'Cursos Totales',
        averageProgress: 'Progreso Promedio',
        upcomingDeadlines: 'Próximas Fechas Límite',
        unreadMessages: 'Mensajes No Leídos',
        courseProgress: 'Progreso del Curso',
        viewAllCourses: 'Ver Todos los Cursos',
        recentActivity: 'Actividad Reciente',
        viewAllActivity: 'Ver Toda la Actividad',
        progress: 'Progreso',
        lessons: 'Lecciones',
        continueCourse: 'Continuar Curso',
        lastViewed: 'Última Vista',
        continueLesson: 'Continuar Lección',
        enrollOnCourse: 'Inscribirse en el Curso',
    },
    ExamReview: {
        review: 'Revisión',
        teacher: 'Profesor',
        score: 'Puntuación',
        outOf: 'de',
        correct: 'Correctas',
        questions: 'Preguntas',
        aiReview: 'Revisión AI',
        aiReviewTitle: 'Revisión AI',
        aiReviewDescription: 'Aquí está el análisis de AI de tus respuestas.',
        question: 'Pregunta',
        answer: 'Respuesta',
        overallFeedback: 'Comentarios Generales',
        yourAnswer: 'Tu Respuesta',
        correctAnswer: 'Respuesta Correcta',
        feedback: 'Comentarios',
        waitingForReview: 'Esperando revisión',
        notSpecified: 'No especificado',
        aiReviewFooter: 'Esta es la revisión de IA de tu examen, no es final y es solo para tu referencia sobre cómo lo hiciste. Por favor, espera la revisión final de tu profesor.',
        options: 'Opciones',
        totalQuestions: 'Total de preguntas',
        noFeedback: 'Sin comentarios',
        noAnswer: 'Sin respuesta',
        aiProcessingMessage: 'Procesando la revisión de AI...',
        aiNotAvailableMessage: 'La revisión de AI no está disponible en este momento.',
    },
    NotificationsPage: {
        title: 'Notificaciones',
        filters: 'Filtros',
        allNotifications: 'Todas las Notificaciones',
        comments: 'Comentarios',
        commentReplies: 'Respuestas a Comentarios',
        examReviews: 'Revisiones de Exámenes',
        orderRenewals: 'Renovaciones de Pedidos',
        searchPlaceholder: 'Buscar notificaciones',
        viewDetails: 'Ver Detalles',
        markAsRead: 'Marcar como leído',
        markAsUnread: 'Marcar como no leído',
        lastViewed: 'Última Vista',
    },
    FreeChat: {
        simpleEditor: 'Editor Simple',
        markdownEditor: 'Editor Avanzado',
    },
    StudentExercisePage: {
        backToCourse: 'Volver al Curso',
        helpTooltip: '¿Necesitas ayuda? Haz clic aquí para más información.',
        minutes: 'minutos',
        progress: 'Progreso',
        tips: 'Consejos',
        tip1: 'Lee las instrucciones cuidadosamente.',
        tip2: 'Tómate tu tiempo para entender el problema.',
        tip3: 'Pide ayuda si te quedas atascado.',
        actions: 'Acciones',
        saveProgress: 'Guardar Progreso',
        shareProgress: 'Compartir Progreso',
        congratulations: '¡Felicidades!',
        exerciseCompleted: 'Has completado el ejercicio con éxito.',
        instructions: 'Instrucciones',
        deleteConfirmation: {
            title: '¿Estás absolutamente seguro?',
            description: 'Esta acción no se puede deshacer. Esto eliminará permanentemente los datos de nuestros servidores.',
            cancel: 'Cancelar',
            continue: 'Continuar',
            error: 'Error',
            success: 'Ejercicio eliminado',
            trigger: 'Eliminar progreso',
        },
    },
    NotEnrolledMessage: {
        courseAccess: 'Acceso al Curso',
        notEnrolledIn: 'No Inscrito en',
        enrollPrompt: '¡Estás a solo un paso de acceder a este increíble curso! Inscríbete ahora para desbloquear todas las lecciones y comenzar tu viaje de aprendizaje.',
        aboutThisCourse: 'Sobre este curso:',
        enrollNow: 'Inscribirse Ahora',
    },
    NoCourseOrSubAlert: {
        unlockLearningJourney: 'Desbloquea Tu Viaje de Aprendizaje',
        embarkExperience: 'Embárcate en una experiencia educativa transformadora. Elige tu camino hacia el conocimiento y el éxito.',
        subscriptionPlans: 'Planes de Suscripción',
        individualCourses: 'Cursos Individuales',
        unlimitedLearning: 'Aprendizaje Ilimitado con Nuestra Suscripción',
        subscriptionDescription: 'Obtén acceso a todos nuestros cursos y contenido exclusivo con una suscripción mensual o anual.',
        viewSubscriptionPlans: 'Ver Planes de Suscripción',
        learnAtYourOwnPace: 'Aprende a Tu Propio Ritmo',
        individualDescription: 'Elige entre nuestra amplia gama de cursos individuales adaptados a tus necesidades e intereses específicos.',
        browseIndividualCourses: 'Explorar Cursos Individuales',
        accessAllCourses: 'Acceso a Todos los Cursos',
        unlimitedAccess: 'Acceso ilimitado a toda nuestra biblioteca de cursos',
        exclusiveContent: 'Contenido Exclusivo',
        premiumMaterials: 'Obtén acceso a materiales de aprendizaje premium',
        communitySupport: 'Soporte Comunitario',
        vibrantCommunity: 'Únete a nuestra vibrante comunidad de aprendizaje',
        certificates: 'Certificados',
        earnCertificates: 'Obtén certificados al completar los cursos',
    },
    ChatBox: {
        closeChat: 'Cerrar chat',
        openChat: 'Abrir chat',
        chatAssistant: 'Asistente de Chat',
        minimize: 'Minimizar',
        expand: 'Expandir',
        greeting: '¡Hola! Soy tu asistente de IA. ¿Cómo puedo ayudarte hoy?',
        quickAccess: {
            productQuestions: 'Preguntas sobre productos y generales',
            shareFeedback: 'Compartir comentarios',
            loggingIn: 'Iniciar sesión',
            reset2FA: 'Restablecer 2FA',
            abuseReport: 'Informe de abuso',
            contactingSales: 'Contactar con Ventas y Asociaciones',
        },
        typeMessage: 'Escribe tu mensaje...',
        sendMessage: 'Enviar mensaje',
    },
    StudentOnBoarding: {
        welcomeHome: 'Bienvenido a la Página Principal',
        homeDescription: 'Este es el punto de partida de tu viaje. Aquí puedes encontrar las últimas actualizaciones y navegar a otras secciones.',
        manageAccount: 'Gestiona Tu Cuenta',
        accountDescription: 'En esta sección, puedes actualizar tu información personal, cambiar tu contraseña y gestionar la configuración de tu cuenta.',
        chatWithAI: 'Chatea con Nuestro AI',
        chatDescription: 'Usa la función de chat para interactuar con nuestro AI. Puedes pedir prácticas para tu examen o simplemente charlar sobre cualquier cosa.',
        checkNotifications: 'Revisa las Notificaciones',
        notificationsDescription: 'Mantente actualizado con las últimas notificaciones. Aquí encontrarás alertas sobre nuevos mensajes, actualizaciones y otra información importante.',
        toggleDarkTheme: 'Cambiar a Tema Oscuro',
        darkThemeDescription: 'Cambia entre temas claros y oscuros según tu preferencia. Esto puede ayudar a reducir la fatiga visual en condiciones de poca luz.',
        viewProfile: 'Ver Tu Perfil',
        profileDescription: 'Accede a tu perfil para ver tu actividad, actualizar tu foto de perfil y gestionar tu información personal.',
        takeTour: 'Haz un recorrido por el tablero',
    }
} as const
