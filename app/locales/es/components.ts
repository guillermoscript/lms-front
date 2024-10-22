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
        account: 'Cuenta',
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
        content: 'Contenido',
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
            typeYourMessage: 'Escribe tu mensaje...',
            filesSelected: '{count} archivo(s) seleccionado(s)',
            remove: 'Eliminar',
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
        current: 'Actual',
        viewLesson: 'Ver lección',
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
            englishTask: `# Mi Comida Favorita

## Objetivo:

Practicar la escritura de un párrafo descriptivo en español sobre tu comida favorita. Este ejercicio te ayudará a mejorar la construcción de oraciones, el vocabulario y la capacidad de expresar tus preferencias.

## Instrucciones:

1. **Brainstorming:** Piensa en tu comida favorita.  Considera no solo el sabor, sino también los recuerdos y las sensaciones asociadas con ella.

2. **Escribe un Párrafo (5-7 oraciones):** Escribe un breve párrafo sobre tu comida favorita, respondiendo a las siguientes preguntas:

    * **¿Cuál es tu comida favorita?**  Comienza estableciendo claramente tu comida favorita.
    * **¿Por qué te gusta?** Describe el sabor, la textura y el aroma. ¡Sé específico! Utiliza adjetivos descriptivos. ¿Es dulce, salada, picante, crujiente, cremosa?
    * **¿Cuándo la comes normalmente?** ¿Es un plato para ocasiones especiales, una comida diaria, o un tentempié reconfortante? Proporciona contexto.
    * **¿Con quién disfrutas comerla?** ¿La comes con tu familia, amigos, o solo?  Comparte un poco sobre el aspecto social de disfrutar tu comida favorita.

3. **Ejemplo:**

    "My favorite food is pasta carbonara.  I love the rich, creamy sauce and the salty flavor of the pancetta.  The texture of the perfectly cooked pasta is also a delight – not too soft, not too firm. I usually eat it on special occasions, like birthdays or anniversaries, because it feels like a celebratory meal. I enjoy sharing this dish with my family, especially my grandmother, who taught me how to make it.  It's a tradition that brings us closer together."


4. **Consejos para escribir un buen párrafo:**

    * **Lenguaje descriptivo:** Usa palabras descriptivas para que tu párrafo sea más atractivo y envolvente.
    * **Variedad de oraciones:** Evita empezar todas las oraciones con "Me".  Experimenta con diferentes estructuras de oraciones para hacer tu escritura más dinámica.
    * **Revisa tu ortografía y gramática:** Revisa cuidadosamente tu párrafo antes de enviarlo.


5. **Envía tu Párrafo:**  Envia tu párrafo completo al chat para que pueda ser revisado.  Recuerda que puedes hacer preguntas si tienes dudas. Estoy aquí para ayudarte.`,
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
        exercises: 'Ejercicios',
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
            searchWeb: {
                title: 'Buscar en la web',
                text: 'Buscar en la web por información o recursos sobre la lección.',
            },
            getQuestions: {
                title: 'Obtener preguntas',
                text: 'Dame buenas preguntas para la lección.',
            },
            didntUnderstand: {
                title: 'No entendí',
                text: 'No entendí la lección. ¿Puedes explicármela de nuevo y de manera diferente?',
            }
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
    },
    ExamPrepSetup: {
        messageTemplates: 'Plantillas de Mensajes',
        messageTemplatesDescription: 'Estos botones te ayudarán a crear un mensaje siguiendo una plantilla, para el botón específico obtendrás un texto básico con algunos marcadores de posición para completar.',
        createExamFormTemplate: 'Crear Plantilla de Formulario de Examen',
        createExamFormTemplateDescription: 'Este botón te ayudará a crear un formulario de examen básico para la materia que desees. Para eso, necesitarás completar los marcadores de posición marcados con " ". La IA mejorará el formulario con la información que proporciones. Cuanta más información des, mejor será el formulario. También ten en cuenta que la IA te pedirá más información si es necesario. Así que prepárate para proporcionarla.',
        examSuggestionsTemplate: 'Plantilla de Sugerencias de Examen',
        examSuggestionsTemplateDescription: 'Este botón te ayudará a pedirle a la IA sugerencias para un formulario de examen para la materia que desees. Para eso, necesitarás completar los marcadores de posición marcados con " ". La IA te dará algunas sugerencias para el formulario. Puedes pedir más sugerencias si lo deseas.',
        suggestions: 'Sugerencias',
        suggestionsDescription: 'Aquí es donde puedes ver las sugerencias de la IA para chatear con la IA.',
        chatWithAI: 'Chatea con el asistente de IA',
        chatWithAIDescription: 'Aquí es donde puedes chatear con el asistente de IA. Puedes hacer preguntas, obtener sugerencias y más.',
        guidedTutorial: 'Tutorial Guiado',
        guidedTutorialDescription: 'Si deseas saber más sobre el chat de preparación para exámenes, haz clic en el botón de arriba para comenzar el recorrido.',
    },
    MarkdownEditorTour: {
        welcomeGuide: 'Bienvenido a la guía sobre cómo usar el editor de texto',
        welcomeGuideDescription: 'Aquí puedes encontrar un tutorial guiado para ayudarte a trabajar con el editor de texto enriquecido.',
        simpleTab: 'Esta es la pestaña para texto simple',
        simpleTabDescription: 'Aquí puedes hacer clic en esta pestaña para escribir texto simple.',
        simpleContent: 'Esta es el área de contenido para texto simple',
        simpleContentDescription: 'Aquí puedes escribir texto simple. no admite la renderización de markdown. es solo texto plano.',
        markdownTab: 'Esta es la pestaña para texto markdown',
        markdownTabDescription: 'Aquí puedes hacer clic en esta pestaña para escribir texto markdown. admite la renderización de markdown.',
        clickToContinue: 'Por favor, haz clic en la pestaña para continuar con el tutorial',
        markdownContent: 'Esta es el área de contenido para texto markdown',
        markdownContentDescription: 'Aquí puedes seleccionar esta pestaña para escribir texto markdown. admite la renderización de markdown. también tiene múltiples opciones para formatear tu texto. Como bloques de código, listas y más. vamos a explorarlo',
        blockTypeSelect: 'Este es el selector de tipo de bloque',
        blockTypeSelectDescription: 'Aquí puedes seleccionar el tipo de bloque. como párrafo, encabezado, bloque de código y más.',
        boldItalicUnderlineSelect: 'Este es el selector de negrita, cursiva, subrayado',
        boldItalicUnderlineSelectDescription: 'Aquí puedes seleccionar las opciones de negrita, cursiva, subrayado para formatear tu texto.',
        createLinkSelect: 'Este es el selector de crear enlace',
        createLinkSelectDescription: 'Aquí puedes crear un enlace en tu texto.',
        listToggleSelect: 'Este es el selector de alternar lista',
        listToggleSelectDescription: 'Aquí puedes seleccionar el alternador de lista para crear listas en tu texto.',
        undoRedoSelect: 'Este es el selector de deshacer rehacer',
        undoRedoSelectDescription: 'Aquí puedes deshacer o rehacer los cambios en tu texto.',
        insertTableSelect: 'Este es el selector de insertar tabla',
        insertTableSelectDescription: 'Aquí puedes insertar una tabla en tu texto.',
        insertCodeBlockSelect: 'Este es el selector de simpleCodeBlock',
        insertCodeBlockSelectDescription: 'Aquí puedes insertar un bloque de código en tu texto. Como python, javascript y más. esto tendrá resaltado de sintaxis automático, números de línea y más. Por favor, usa esto cuando quieras insertar código en tu texto.',
        insertSandPackSelect: 'Este es el selector de SandPack',
        insertSandPackSelectDescription: 'Aquí puedes insertar bloques de código que renderizan un editor de código en vivo. con una vista previa en vivo. Esto significa que puedes escribir código y ver el resultado en tiempo real. como un patio de juegos de código con ejecución de código real. admite javascript, typescript, react y más.',
        guidedTutorial: 'Tutorial Guiado',
        guidedTutorialDescription: 'Aquí puedes encontrar un tutorial guiado para ayudarte a trabajar con el editor de texto enriquecido.',
    },
    TaskMessageTour: {
        welcome: 'Bienvenido al Chat de Tareas de IA',
        welcomeDescription: 'Aquí es donde puedes probar lo que has aprendido en la lección. La IA será tu profesor y revisará tu trabajo, te dará retroalimentación y, una vez que des la respuesta correcta, marcará la tarea como completada.',
        taskStatus: 'Estado de la Tarea',
        taskStatusDescription: 'Aquí es donde puedes ver el estado de la tarea. Si has completado la tarea, se mostrará como completada.',
        taskInstructions: 'Instrucciones de la Tarea',
        taskInstructionsDescription: 'Aquí es donde puedes ver las instrucciones para la tarea. Asegúrate de leerlas cuidadosamente antes de comenzar la tarea.',
        messages: 'Mensajes',
        messagesDescription: 'Aquí es donde puedes ver los mensajes de la IA y tus respuestas.',
        selectInputType: 'Selecciona el tipo de entrada',
        selectInputTypeDescription: 'Aquí es donde puedes seleccionar el tipo de entrada. Puedes elegir entre una entrada de texto simple y una entrada de texto markdown.',
        simpleTextInput: 'Una entrada de texto simple',
        simpleTextInputDescription: 'Puedes escribir tu respuesta aquí y enviarla a la IA. Es una entrada de texto simple.',
        markdownTextInput: 'Entrada de texto markdown',
        markdownTextInputDescription: 'Puedes escribir tu respuesta aquí y enviarla a la IA. Es una entrada de texto markdown. Tienes múltiples opciones para formatear tu texto. Como bloques de código, listas y más.',
        sendButton: 'Botón de Enviar',
        sendButtonDescription: 'Aquí es donde puedes enviar tu respuesta a la IA. Una vez que hayas escrito tu respuesta, haz clic en el botón de enviar para enviarla a la IA.',
        guidedTutorialDescription: 'Aquí puedes encontrar un tutorial guiado para ayudarte a comenzar con el Chat de Tareas de IA.',
    },
    ExerciseChat: {
        messageDeleted: 'Mensaje eliminado con éxito.',
        messageDeleteFailed: 'No se pudo eliminar el mensaje.',
        aiMessageRegenerated: 'Mensaje de AI regenerado.',
        aiMessageRegenerateFailed: 'No se pudo regenerar el mensaje de AI.',
        copiedToClipboard: 'Copiado al portapapeles',
        exerciseCompleted: 'Ejercicio completado',
        copied: '¡Copiado!',
        copyToClipboard: 'Copiar al portapapeles',
        save: 'Guardar',
        edit: 'Editar',
        delete: 'Eliminar',
        regenerate: 'Regenerar',
        chatTitle: 'Chat de Ejercicios',
        startWritingToCompleteExercise: 'Empieza a escribir para completar el ejercicio',
        feelFreeToAskQuestions: 'Si tienes alguna pregunta, no dudes en preguntar, El asistente de IA está aquí para ayudarte.',
        exerciseNotApproved: 'Ejecicio no aprobado',
    },
    CourseExercisesPage: {
        exercises: 'Ejercicios',
        searchPlaceholder: 'Buscar ejercicios',
        filter: 'Filtrar',
        allDifficulties: 'Todas las dificultades',
        easy: 'Fácil',
        medium: 'Medio',
        hard: 'Difícil',
        sortBy: 'Ordenar por',
        sortByTitle: 'Ordenar por título',
        sortByDifficulty: 'Ordenar por dificultad',
        review: 'Revisar',
        continue: 'Continuar',
        start: 'Comenzar',
        noExercisesFound: 'No se encontraron ejercicios',
        tryAdjustingSearch: 'Intenta ajustar tu búsqueda o filtro para encontrar lo que buscas.',
    },
    ExerciseSuggestions: {
        noExercisesFound: 'No se encontraron ejercicios',
        noExercisesDescription: 'No se han encontrado ejercicios para esta lección. Por favor, vuelva más tarde o intente con una lección diferente.',
        exerciseSuggestions: 'Sugerencias de ejercicios',
        exerciseSuggestionsDescription: 'Aquí hay algunos ejercicios que puedes hacer para mejorar tus habilidades',
        continue: 'Continuar',
        start: 'Comenzar',
        review: 'Revisar',
    },
    WebSearchResult: {
        webSearchResults: 'Resultados de Búsqueda Web',
        query: 'Consulta',
        hideResults: 'Ocultar resultados de búsqueda',
        showResults: 'Mostrar resultados de búsqueda',
    },
    EditProfileForm: {
        errorUpdatingProfile: 'Error al actualizar el perfil',
        profileUpdatedSuccessfully: 'Perfil actualizado con éxito',
        fullName: 'Nombre Completo',
        fullNamePlaceholder: 'Juan Pérez',
        bio: 'Biografía',
        bioPlaceholder: 'Cuéntanos sobre ti',
        profilePicture: 'Foto de Perfil',
        profilePicturePlaceholder: 'https://example.com/image.jpg',
        updatingProfile: 'Actualizando perfil...',
        updateProfile: 'Actualizar Perfil',
    },
    AccountEditPage: {
        settings: 'Configuraciones',
        editProfile: 'Editar Perfil',
        updateProfileInfo: 'Actualiza la información de tu perfil',
    },
    TeacherAccountPage: {
        editProfile: 'Editar Perfil',
        overview: 'Resumen',
        totalStudents: 'Total de Estudiantes',
        totalClasses: 'Total de Clases',
        averageRating: 'Calificación Promedio',
        nextClass: 'Próxima Clase',
    },
    ExercisesTextEditors: {
        errorLoadingExercise: 'Error al cargar el ejercicio',
        errorExerciseNotApproved: 'Este ejercicio no ha sido aprobado por la IA',
        loading: 'Cargando...',
        submit: 'Enviar',
        simple: 'Simple',
        markdown: 'Editor Avanzado',
        typeYourMessage: 'Escribe tu mensaje...',
        filesSelected: '{count} archivo(s) seleccionado(s)',
        remove: 'Eliminar',
        checkAnswer: 'Verificar respuesta',
    }
} as const
