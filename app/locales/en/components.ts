export default {
    courseSectionComponent: {
        title: 'Your Courses'
    },
    bookingSection: {
        enrollAndViewLessons: 'Enroll & View Lessons',
        viewLessons: 'View Lessons',
        enrollAndViewExams: 'Enroll & View Exams',
        viewExams: 'View Exams',
        loading: 'Loading...',
        errorEnrollingUser: 'Error enrolling user'
    },
    BreadcrumbComponent: {
        dashboard: 'Dashboard',
        student: 'Student',
        course: 'Courses',
        lesson: 'Lessons',
        exam: 'Exams',
        review: 'Reviews',
        chat: 'Chat',
        teacher: 'Teacher',
        edit: 'Edit',
        exercise: 'Exercises',
    },
    RecentlyViewed: {
        title: 'Recently Viewed',
        noViews: 'No views yet',
        viewAll: 'View All',
        viwedOn: 'Viewed on',
        continueReading: 'Continue Reading'
    },
    ChatsSectionComponent: {
        freeChat: 'Free Chat',
        examPrep: 'Exam Prep',
        title: 'Your Chats'
    },
    SidebarLessons: {
        comments: 'Comments',
        timeline: 'Timeline',
        tableOfContents: 'Table of Contents',
        reviews: 'Reviews'
    },
    CommentsSections: {
        title: 'Comments',
        CardTitle: 'Add a Comment',
        edit: 'Edit',
        delete: 'Delete',
        reply: 'Reply',
        comments: 'Comments',
        CommentCard: {
            cancel: 'Cancel',
            reply: 'Reply',
            viewReplies: 'View Replies',
        },
        CommentEditor: {
            toast: {
                titleError: 'Error',
                titleSuccess: 'Success',
                messageError: 'Error adding comment',
                messageSuccess: 'Comment added successfully',
            },
            action: 'Submit Comment',
        }
    },
    LessonContent: {
        video: 'Video',

        summary: 'Summary',
        aiTask: 'AI Task',
        aiTaskCompleted: 'AI Task Completed',
        aiTaksInComplete: 'Task Incomplete',
        content: 'Content',
        RetryError: {
            title: 'Error loading AI Task',
            description: 'There was an issue loading the AI Task'
        },
        ResetTaskAIConversation: {
            button: 'Reset Task AI Conversation',
            title: 'Are you sure you want to reset the AI Task conversation?',
            description: 'This will reset the AI Task conversation and you will lose all progress.',
            cancel: 'Cancel',
            loading: 'Loading...',
            action: 'Reset Conversation',
        },
        TaksMessages: {
            title: 'Complete your task',
            simple: 'Simple',
            markdown: 'Advanced Editor',
            status: 'Success',
            filesSelected: '{count} file(s) selected',
            typeYourMessage: 'Type your message...',
            remove: 'Remove',
        }
    },
    AiTaskMessage: {
        title: 'Complete your task',
        simple: 'Simple',
        markdown: 'Advanced Editor',
        status: 'Success',
    },
    ChatInput: {
        templateExamForm: 'Template for generating exam form for a "X" topic',
        templateForQuestion: 'Template for generating a question for a "X" topic',
        placeholder: 'Type your message here...',
        send: 'Send',
        stop: 'Stop',
    },
    DisclaimerForUser: {
        text: 'LLMs can make mistakes. Verify important information.'
    },
    ChatTextArea: {
        placeholder: 'Type your message here...',
        send: 'Send',
        stop: 'Stop',
    },
    MessageFeatureSection: {
        tooltipContentEdit: 'Edit Message',
        tooltipContentView: 'Go back to view mode',
        tooltipContentRegenerate: 'Regenerate Message',
    },
    EditMessage: {
        simple: 'Simple',
        markdown: 'Advanced Editor',
        editAndRegenerate: 'Edit and Regenerate AI Response',
        edit: 'Edit'
    },
    TimelineItem: {
        current: 'Current',
        viewLesson: 'View Lesson',
    },
    TableOfContents: {
        title: 'Table of Contents',
    },
    ListOfReviews: {
        noReviews: 'No reviews yet, be the first to review this lesson!',
        alreadyReviewed: 'You have already reviewed this lesson',

    },
    ReviewForm: {
        rating: 'Rating',
        'stars#zero': 'Stars',
        'stars#one': 'Stars',
        'stars#other': 'Stars',
        review: 'Review',
        reviewDescription: 'Your review should be between 10 and 160 characters.',
        toast: {
            titleError: 'Error',
            titleSuccess: 'Success',
            messageError: 'Error adding review',
            messageSuccess: 'Your review has been added to the lesson.'
        },
        action: 'Submit Review',
    },
    ExamsSubmissionForm: {
        trueOrFalse: 'True or False',
        freeText: 'Free Text Question',
        multipleChoice: 'Multiple Choice',
        submit: 'Submit Exam',
        alert: {
            title: 'Are you sure you want to submit the exam?',
            warningTitle: 'Incomplete Submission',
            description: 'You will not be able to change your answers after submitting.',
            cancel: 'Cancel',
            submit: 'Submit',
            warningDescription: 'You have some incomplete answers. Submitting will affect your score. Do you wish to proceed?',
        },
    },
    AiReview: {
        title: 'AI Review',
        description: 'This is the AI review of your exam, its not final and is just for your reference on how you did. Please wait for the final review from your teacher.',
        noReview: 'No AI review available',
        overallReview: 'AI Overall Review:'
    },
    ChatOptionsShowcase: {
        title: 'Chat Options Showcase',
        tabs: {
            code: 'Code Teacher',
            english: 'English Teacher',
            spanish: 'Spanish Teacher',
            englishSpeech: 'English Teacher (Speech)',
            codeTask: '**Write a program in Python that does the following:**\n\n- Asks the user to input their name.\n- Asks the user to input their age.\n- Prints a personalized greeting message that includes their name and age.\n- Tells the user how many years are left until they turn 100 years old.\nIf you feel lost, please ask the AI for help',
            englishTask: `# Homework Assignment: My Favorite Food

## Objective:

Practice writing a descriptive paragraph in English about your favorite food. This exercise will help you improve your sentence construction, vocabulary, and ability to express your preferences.

## Instructions:

1. **Brainstorm:**  Think about your absolute favorite food.  Consider not only the taste but also the memories and feelings associated with it.

2. **Write a Paragraph (5-7 sentences):**  Write a short paragraph about your favorite food, making sure to answer the following questions:

    * **What is your favorite food?**  Start by clearly stating your favorite food.
    * **Why do you like it?**  Describe the taste, texture, and aroma.  Be specific! Use descriptive adjectives.  Is it sweet, savory, spicy, crunchy, creamy?
    * **When do you usually eat it?**  Is it a special occasion food, a weekday meal, or a comforting snack?  Provide context.
    * **Who do you enjoy eating it with?** Do you enjoy this food with family, friends, or by yourself?  Share a little about the social aspect of enjoying your favorite food.

3. **Example:**

    "My favorite food is pasta carbonara.  I love the rich, creamy sauce and the salty flavor of the pancetta.  The texture of the perfectly cooked pasta is also a delight – not too soft, not too firm. I usually eat it on special occasions, like birthdays or anniversaries, because it feels like a celebratory meal. I enjoy sharing this dish with my family, especially my grandmother, who taught me how to make it.  It's a tradition that brings us closer together."


4. **Tips for Writing a Great Paragraph:**

    * **Use Vivid Language:**  Use descriptive words to make your paragraph more engaging and appealing.
    * **Vary Your Sentences:**  Avoid starting every sentence with "I."  Try different sentence structures to make your writing more dynamic.
    * **Check Your Grammar and Spelling:**  Proofread your paragraph carefully before submitting it.


5. **Submit Your Paragraph:** Use the mini chat on our platform to submit your completed paragraph for review. Remember to ask any questions you may have. I'm here to help!`,
            spanishTask: `**Homework Assignment: My Favorite Hobby**
            
            **Objective:** Practice writing simple sentences in Spanish.
            
            **Instructions:**
            
            1. **Write a Paragraph in Spanish about Your Favorite Hobby**
            
            - Write a short paragraph (5-7 sentences) about your favorite hobby. Answer the following questions in your paragraph:
            - What is your favorite hobby?
            - Why do you like it?
            - When do you usually do it?
            - Who do you like to do it with?
            
            2. **Example of How to Write Your Paragraph:**
            
            \`\`\`
            
            My favorite hobby is reading. I like reading because it allows me to travel to other worlds. I usually read in the afternoon when I have free time. Sometimes, I read with my friends at the library. We enjoy sharing our favorite stories. Reading is a fun way to learn.

            \`\`\``,
            englishSpeechTask: `## Speech Practice Teacher
Please speak in English, The AI will help you be giving you feedback on your speech.
\n**Things to talk about:**
- Talk about your hobbies, the AI will continue the conversation.
- Talk about your favorite foods, the AI will continue the conversation and give you feedback.
- Ask questions about grammar, the AI will help you resolve your doubts.
- Ask about vocabulary exercises, the AI will create exercises for you to practice.
- Give a speech, the AI will give you feedback on your speech.

# IMPORTANT
### Only speak in English, the AI will not understand other languages.

If you have doubts, try saying: "Could you give me a fake scenario to practice my speaking?"`,
        },
    },
    EnhancedVoiceAIChat: {
        status: {
            inactive: 'inactive',
            active: 'active',
            loading: 'loading',
            oneSecond: 'One second...',
            trialEnded: 'Your trial has ended',
        },
        statusMessage: {
            giveItATry: 'Give it a try!',
            justTalk: 'Just talk.',
            aiIsSpeaking: 'AI is speaking...',
            aiFinishedSpeaking: 'AI finished speaking',
            errorOccurred: 'Error occurred. Try again.',
            stopping: 'Stopping...',
            oneSecond: 'One second...',
        },
        callStatus: {
            inactive: 'inactive',
            active: 'active',
            loading: 'loading',
        },
        earlyAccess: 'To continue using the service, please be sure to subscribe to our early access program.',
        subscribe: 'Subscribe Now!',
    },
    SuccessMessage: {
        status: 'Success!',
        message: 'Assignment marked as completed.',
    },
    SubscribeNow: {
        title: 'Subscribe Now!',
        description: 'To continue using the service, please be sure to subscribe to our early access program.',
    },
    FreeChatSetup: {
        freeChat: {
            title: 'Free Chat',
            description: 'This is where you can chat with the AI assistant. You can ask questions, get suggestions, and more.',
        },
        examPrep: {
            title: 'Exam Preparation',
            description: 'This part is where you can create and view all of your exam preparation messages. This is a different chat type from the free chat, focused on exam preparation.',
        },
        quizMe: {
            title: 'Quiz Me',
            description: 'This is where you can prepare for your exams, the AI will create Forms for you to fill out and get feedback on your answers.',
        },
        suggestions: {
            title: 'Suggestions',
            description: 'This is where you can get suggestions on what to do next. The AI will guide you on what to do next.',
        },
        editor: {
            title: 'Editor',
            description: 'This is where you can write code, markdown, or any other text. The AI will help you with your code, markdown, or text.',
        },
        title: 'Guided Tutorial',
        description: 'If you want to know more about the free chat, click the button above to start the tour.',
    },
    ExamLink: {
        title: 'Quiz Me',
        description: 'This is where you can prepare for your exams, the AI will create Forms for you to fill out and get feedback on your answers.',
    },
    EmptyChatState: {
        title: 'Ask me anything, I\'m here to help!',
    },
    SearchChats: {
        input: 'Type to search your chats',
        empty: 'No results found.',
        freeChat: 'Free Chat',
        examPrep: 'Exam Prep',
    },
    StudentCreateNewChat: {
        title: 'Untitled Chat',
        newChat: 'Nuevo chat',
    },
    courseCols: {
        id: 'ID',
        title: 'Title',
        description: 'Description',
        status: 'Status',
        date: 'Date',
        actions: 'Actions',
    },
    CreateCourse: {
        title: 'Create a new course',
        actionButton: 'Create Course',
        dialogTitle: 'Create a new course',
        form: {
            title: 'Title',
            description: 'Description',
            thumbnail: 'Thumbnail',
            tags: 'Tags',
            category: 'Category',
            product: 'Product',
        }
    },
    SelectStatus: {
        status: 'Status',
        placeholder: 'Select status',
        draft: 'Draft',
        published: 'Published',
        archived: 'Archived',
    },
    DeleteAlert: {
        title: 'Are you sure you want to delete this?',
        description: 'This action cannot be undone.',
        cancel: 'Cancel',
        delete: 'Delete',
    },
    DeleteCourseAlert: {
        course: 'Course',
    },
    lessonsCols: {
        id: 'ID',
        title: 'Title',
        description: 'Description',
        sequence: 'Sequence',
        date: 'Date',
        actions: 'Actions',
    },
    LessonForm: {
        title: 'Lesson',
        form: {
            title: 'Title',
            description: 'Description',
            sequence: 'Sequence',
            video_url: 'YouTube Video URL',
            embed: 'Embed Code',
            image: 'Image URL',
            content: 'Content',
            status: 'Status',
            statusOptions: {
                draft: 'Draft',
                published: 'Published',
                archived: 'Archived',
            },
            systemPrompt: 'System Prompt',
            taskInstructions: 'Task Instructions',
        },
        cardTitle: 'Content of the lesson',
        systemPromptTitle: 'System Prompt',
        systemPromptDescription: 'This is the prompt that the AI will use to generate responses.',
        taskInsturctionsTitle: 'Task Instructions',
        taskInstructionsDescription: 'This is the task that the AI will use to generate responses.',
    },
    TeacherTestForm: {
        edit: 'Edit',
        create: 'Create',
        form: {
            testName: 'Name of the exam',
            testDescription: 'Description of the exam',
            sequence: 'Sequence',
            exam_date: 'Exam Date',
            duration: 'Duration (in minutes)',
            status: 'Status',
            statusOptions: {
                draft: 'Draft',
                published: 'Published',
                archived: 'Archived',
            },
            update: 'Update',
            create: 'Create',
        },
        card: {
            title: 'Exam Questions',
            description: 'This is where you can add questions to your exam.',
        }
    },
    TestSubmissionReview: {
        studentAnswer: 'Student Answer',
        feedback: 'Feedback',
        score: 'Score',
        correct: 'Correct?',
        overallFeedback: 'Overall Feedback',

    },
    CourseDashboard: {
        yourCourses: 'Your Courses',
        searchCourses: 'Search Courses',
        inProgress: 'In Progress',
        completed: 'Completed',
        allCourses: 'All Courses',
        lessons: 'Lessons',
        exams: 'Exams',
        continueCourse: 'Continue Course',
        noCoursesFound: 'No courses found',
        exercise: 'Exercises',
    },
    StudentDashboard: {
        welcome: 'Welcome, Student!',
        dashboardDescription: 'Here is an overview of your courses and activities.',
        totalCourses: 'Total Courses',
        averageProgress: 'Average Progress',
        upcomingDeadlines: 'Upcoming Deadlines',
        unreadMessages: 'Unread Messages',
        courseProgress: 'Course Progress',
        viewAllCourses: 'View All Courses',
        recentActivity: 'Recent Activity',
        viewAllActivity: 'View All Activity',
        progress: 'Progress',
        lessons: 'Lessons',
        continueCourse: 'Continue Course',
        lastViewed: 'Last Viewed',
        continueLesson: 'Continue Lesson',
        enrollOnCourse: 'Enroll on Course',
    },
    ExamReview: {
        review: 'Review',
        teacher: 'Teacher',
        score: 'Score',
        outOf: 'out of',
        correct: 'Correct',
        questions: 'Questions',
        aiReview: 'AI Review',
        aiReviewTitle: 'AI Review',
        aiReviewDescription: 'Here is the AI analysis of your answers.',
        question: 'Question',
        answer: 'Answer',
        overallFeedback: 'Overall Feedback',
        yourAnswer: 'Your Answer',
        correctAnswer: 'Correct Answer',
        feedback: 'Feedback',
        waitingForReview: 'Waiting for review',
        notSpecified: 'Not specified',
        aiReviewFooter: 'This is the AI review of your exam, its not final and is just for your reference on how you did. Please wait for the final review from your teacher.',
        options: 'Options',
        totalQuestions: 'Total Questions',
        noFeedback: 'No feedback provided',
        noAnswer: 'No answer provided',
        aiProcessingMessage: 'AI is processing your exam...',
        aiNotAvailableMessage: 'AI review is not available for this exam.',
    },
    NotificationsPage: {
        title: 'Notifications',
        filters: 'Filters',
        allNotifications: 'All Notifications',
        comments: 'Comments',
        commentReplies: 'Comment Replies',
        examReviews: 'Exam Reviews',
        orderRenewals: 'Order Renewals',
        searchPlaceholder: 'Search notifications',
        viewDetails: 'View Details',
        markAsRead: 'Mark as read',
        markAsUnread: 'Mark as unread',
        lastViewed: 'Last Viewed',
    },
    FreeChat: {
        simpleEditor: 'Simple Editor',
        markdownEditor: 'Markdown Editor',
    },
    exerciseCols: {
        title: 'Title',
        description: 'Description',
        created_at: 'Created At',
        created_by: 'Created By',
        exercise_type: 'Exercise Type',
        difficulty_level: 'Difficulty Level',
    },
    StudentExercisePage: {
        backToCourse: 'Back to Course',
        helpTooltip: 'Need help? Click here for more information.',
        minutes: 'minutes',
        progress: 'Progress',
        tips: 'Tips',
        tip1: 'Read the instructions carefully.',
        tip2: 'Take your time to understand the problem.',
        tip3: 'Ask for help if you get stuck.',
        actions: 'Actions',
        saveProgress: 'Save Progress',
        shareProgress: 'Share Progress',
        congratulations: 'Congratulations!',
        exerciseCompleted: 'You have successfully completed the exercise.',
        instructions: 'Instructions',
        deleteConfirmation: {
            title: 'Are you absolutely sure?',
            description: 'This action cannot be undone. This will permanently delete your data from our servers.',
            cancel: 'Cancel',
            continue: 'Continue',
            error: 'Error',
            success: 'Exercise deleted',
            trigger: 'Delete Progress',
        },
    },
    NotEnrolledMessage: {
        courseAccess: 'Course Access',
        notEnrolledIn: 'Not Enrolled in',
        enrollPrompt: "You're just one step away from accessing this amazing course! Enroll now to unlock all the lessons and start your learning journey.",
        aboutThisCourse: 'About this course:',
        enrollNow: 'Enroll Now',
    },
    NoCourseOrSubAlert: {
        unlockLearningJourney: 'Unlock Your Learning Journey',
        embarkExperience: 'Embark on a transformative educational experience. Choose your path to knowledge and success.',
        subscriptionPlans: 'Subscription Plans',
        individualCourses: 'Individual Courses',
        unlimitedLearning: 'Unlimited Learning with Our Subscription',
        subscriptionDescription: 'Get access to all our courses and exclusive content with a monthly or annual subscription.',
        viewSubscriptionPlans: 'View Subscription Plans',
        learnAtYourOwnPace: 'Learn at Your Own Pace',
        individualDescription: 'Choose from our wide range of individual courses tailored to your specific needs and interests.',
        browseIndividualCourses: 'Browse Individual Courses',
        accessAllCourses: 'Access All Courses',
        unlimitedAccess: 'Unlimited access to our entire course library',
        exclusiveContent: 'Exclusive Content',
        premiumMaterials: 'Get access to premium learning materials',
        communitySupport: 'Community Support',
        vibrantCommunity: 'Join our vibrant learning community',
        certificates: 'Certificates',
        earnCertificates: 'Earn certificates upon course completion',
    },
    ChatBox: {
        closeChat: 'Close chat',
        openChat: 'Open chat',
        chatAssistant: 'Chat Assistant',
        minimize: 'Minimize',
        expand: 'Expand',
        greeting: "Hi! I'm your AI assistant. How can I help you today?",
        quickAccess: {
            searchWeb: {
                title: 'Search the Web',
                description: 'Search the web for information or resources on the lesson topic.',
            },
            getQuestions: {
                title: 'Get Questions',
                description: 'Give me a set of good questions for the lesson.',
            },
            didntUnderstand: {
                title: 'Didn\'t Understand',
                description: 'I didn\'t understand the lesson. Can you help me understand it better?',
            }
        },
        typeMessage: 'Type your message...',
        sendMessage: 'Send message',
    },
    StudentOnBoarding: {
        welcomeHome: 'Welcome to the Home Page',
        homeDescription: 'This is the starting point of your journey. Here you can find the latest updates and navigate to other sections.',
        manageAccount: 'Manage Your Account',
        accountDescription: 'In this section, you can update your personal information, change your password, and manage your account settings.',
        chatWithAI: 'Chat with Our AI',
        chatDescription: 'Use the chat feature to interact with our AI. You can ask for practices for your exam or just chat about anything.',
        checkNotifications: 'Check Notifications',
        notificationsDescription: 'Stay updated with the latest notifications. Here you will find alerts about new messages, updates, and other important information.',
        toggleDarkTheme: 'Toggle Dark Theme',
        darkThemeDescription: 'Switch between light and dark themes to suit your preference. This can help reduce eye strain in low-light conditions.',
        viewProfile: 'View Your Profile',
        profileDescription: 'Access your profile to see your activity, update your profile picture, and manage your personal information.',
        takeTour: 'Take a tour of the dashboard',
    },
    ExamPrepSetup: {
        messageTemplates: 'Message Templates',
        messageTemplatesDescription: 'This buttons will help you to create a message following a template, for the specific button you will get a basic text with some placeholders to fill out.',
        createExamFormTemplate: 'Create Exam Form Template',
        createExamFormTemplateDescription: 'This button will help you to create a basic exam form for the subject you want. For that your will need to fill out the placeholders marked with " ". The AI will improve the form with the information you provide. The more you give the better the form will be. Also keep in mind that the AI will ask you for more information if needed. So be ready to provide it.',
        examSuggestionsTemplate: 'Exam Suggestions Template',
        examSuggestionsTemplateDescription: 'This button will help you to ask the AI for suggestions for an exam form for the subject you want. For that your will need to fill out the placeholders marked with " ". The AI will give you some suggestions for the form. You can ask for more suggestions if you want.',
        suggestions: 'Suggestions',
        suggestionsDescription: 'This is where you can view the suggestions from the AI. to chat about with the AI.',
        chatWithAI: 'Chat with the AI assistant',
        chatWithAIDescription: 'This is where you can chat with the AI assistant. You can ask questions, get suggestions, and more.',
        guidedTutorial: 'Guided Tutorial',
        guidedTutorialDescription: 'If you want to know more about the exam prep chat, click the button above to start the tour.',
    },
    MarkdownEditorTour: {
        welcomeGuide: 'Welcome to guide on how to use the text editor',
        welcomeGuideDescription: 'Here you can find a guided tutorial to help you work with the rich text editor.',
        simpleTab: 'This is the tab for simple text',
        simpleTabDescription: 'Here you can click this tab to write simple text.',
        simpleContent: 'This is the content area for simple text',
        simpleContentDescription: 'Here you can write simple text. it does not support markdown rendering. its just plain text.',
        markdownTab: 'This is the tab for markdown text',
        markdownTabDescription: 'Here you can click this tab to write markdown text. it supports markdown rendering.',
        clickToContinue: 'Please click the tab to continue the tutorial',
        markdownContent: 'This is the content area for markdown text',
        markdownContentDescription: 'Here you can select this tab to write markdown text. it supports markdown rendering. it also has multiple options to format your text. Like code blocks, lists, and more. lets explore it',
        blockTypeSelect: 'This is the block type select',
        blockTypeSelectDescription: 'Here you can select the block type. like paragraph, heading, code block, and more.',
        boldItalicUnderlineSelect: 'This is the bold, italic, underline select',
        boldItalicUnderlineSelectDescription: 'Here you can select the bold, italic, underline options to format your text.',
        createLinkSelect: 'This is the create link select',
        createLinkSelectDescription: 'Here you can create a link in your text.',
        listToggleSelect: 'This is the list toggle select',
        listToggleSelectDescription: 'Here you can select the list toggle to create lists in your text.',
        undoRedoSelect: 'This is the undo redo select',
        undoRedoSelectDescription: 'Here you can undo or redo your text changes.',
        insertTableSelect: 'This is the insert table select',
        insertTableSelectDescription: 'Here you can insert a table in your text.',
        insertCodeBlockSelect: 'This is the simpleCodeBlock select',
        insertCodeBlockSelectDescription: 'Here you can insert a code block in your text. Like python, javascript, and more. this will have automatic syntax highlighting, line numbers, and more. Please use this when you want to insert code in your text.',
        insertSandPackSelect: 'This is the SandPack select',
        insertSandPackSelectDescription: 'Here you can insert code blocks that renders a live code editor. with a live preview. This means that you can write code and see the output in real-time. like a code playground with real code execution. it supports javascript, typescript, react, and more.',
        guidedTutorial: 'Guided Tutorial',
        guidedTutorialDescription: 'Here you can find a guided tutorial to help you work with the rich text editor.',
    },
    TaskMessageTour: {
        welcome: 'Welcome to the AI Task Chat',
        welcomeDescription: 'Here is where you can test what you have learned in the lesson. The AI will be your teacher and will review your work, give you feedback, and once you give the correct answer, it will mark the task as completed.',
        taskStatus: 'Task Status',
        taskStatusDescription: 'This is where you can see the status of the task. If you have completed the task, it will show as completed.',
        taskInstructions: 'Task Instructions',
        taskInstructionsDescription: 'This is where you can see the instructions for the task. Make sure to read them carefully before starting the task.',
        messages: 'Messages',
        messagesDescription: 'This is where you can see the messages from the AI and your responses.',
        selectInputType: 'Select the input type',
        selectInputTypeDescription: 'This is where you can select the input type. You can choose between a simple text input and a markdown text input.',
        simpleTextInput: 'A simple text input',
        simpleTextInputDescription: 'You can type your response here and send it to the AI. It\'s a simple text input.',
        markdownTextInput: 'Markdown text input',
        markdownTextInputDescription: 'You can type your response here and send it to the AI. It\'s a markdown text input. You have multiple options to format your text. Like code blocks, lists, and more.',
        sendButton: 'Send Button',
        sendButtonDescription: 'This is where you can send your response to the AI. Once you have typed your response, click the send button to send it to the AI.',
        guidedTutorialDescription: 'Here you can find a guided tutorial to help you get started with the AI Task Chat.',
    },
    ExerciseChat: {
        messageDeleted: 'Message deleted successfully.',
        messageDeleteFailed: 'Failed to delete message.',
        aiMessageRegenerated: 'AI message regenerated.',
        aiMessageRegenerateFailed: 'Failed to regenerate AI message.',
        copiedToClipboard: 'Copied to clipboard',
        exerciseCompleted: 'Exercise completed',
        copied: 'Copied!',
        copyToClipboard: 'Copy to clipboard',
        save: 'Save',
        edit: 'Edit',
        delete: 'Delete',
        regenerate: 'Regenerate',
        chatTitle: 'Chat with the AI',
        startWritingToCompleteExercise: 'Start writing to complete the exercise',
        feelFreeToAskQuestions: 'Feel free to ask questions about the exercise if it is unclear.',
    },
    CourseExercisesPage: {
        exercises: 'Exercises',
        searchPlaceholder: 'Search exercises',
        filter: 'Filter',
        allDifficulties: 'All Difficulties',
        easy: 'Easy',
        medium: 'Medium',
        hard: 'Hard',
        sortBy: 'Sort by',
        sortByTitle: 'Sort by Title',
        sortByDifficulty: 'Sort by Difficulty',
        review: 'Review',
        continue: 'Continue',
        start: 'Start',
        noExercisesFound: 'No exercises found',
        tryAdjustingSearch: 'Try adjusting your search or filter to find what you\'re looking for.',
    },
    ExerciseSuggestions: {
        noExercisesFound: 'No Exercises Found',
        noExercisesDescription: 'No exercises for this lesson have been found. Please check back later or try a different lesson.',
        exerciseSuggestions: 'Exercise Suggestions',
        exerciseSuggestionsDescription: 'Here are some exercises that you can do to improve your skills',
        continue: 'Continue',
        start: 'Start',
        review: 'Review',
    },
    WebSearchResult: {
        webSearchResults: 'Web Search Results',
        query: 'Query',
        hideResults: 'Hide search results',
        showResults: 'Show search results',
    },
} as const
