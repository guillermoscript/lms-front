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
            englishTask: `**Homework Assignment: My Favorite Food**

**Objective:** Practice writing simple sentences in English.

**Instructions:**

1. **Write a Paragraph in English about Your Favorite Food**
   - Please write a short paragraph (5-7 sentences) about your favorite food. Answer the following questions in your paragraph:
     - What is your favorite food?
     - Why do you like it?
     - When do you usually eat it?
     - Who do you enjoy eating it with?

2. **Example of How to Write Your Paragraph:**
   \`\`\`
   My favorite food is tacos. I like tacos because they are tasty and versatile. I usually eat tacos on weekends with my friends. We enjoy different fillings like beef, chicken, and vegetables. Tacos are fun to make together! I love adding spicy salsa to my tacos.
   \`\`\`
`,
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
    }
} as const
