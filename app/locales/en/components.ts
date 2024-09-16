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
        }
    },
    AiTaskMessage: {
        title: 'Complete your task',
        simple: 'Simple',
        markdown: 'Markdown',
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
        markdown: 'Markdown',
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
            description: 'You will not be able to change your answers after submitting.',
            cancel: 'Cancel',
            submit: 'Submit'
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
    }
} as const
