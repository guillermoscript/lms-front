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
    }
} as const
