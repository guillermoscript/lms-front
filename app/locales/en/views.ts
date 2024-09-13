export default {
    landing: {
        title: 'Next Gen AI-Powered Learning',
        description: 'Dive into expertly crafted courses spanning from English to advanced programming, guided by AI and human experts to maximize your potential.',
        getEarlyAccess: 'Get Early Access',
        betaBadge: 'We are currently in beta. Get early access now!',
        features: {
            title: 'Packed with Innovative Features',
            description: 'Experience educational excellence with a suite of powerful AI-driven tools designed to personalize and enhance your learning journey.',
            aiReviews: {
                title: 'AI-Powered Lesson Reviews',
                description: "Get instant feedback from our artificial intelligence on your assigned tasks. Complete your lessons with confidence, knowing you'll receive real-time suggestions for improvement or an immediate pass when you've mastered the material."
            },
            professionalContentCreation: {
                title: 'Professional Content Creation',
                description: 'Every lesson is crafted by industry professionals to ensure high-quality, relevant content that stays current with trends and best practices.'
            },
            advancedInteractiveExams: {
                title: 'Advanced Interactive Exams',
                description: 'Transform your preparation with AI-generated exam forms, featuring various question types, from multiple choice to free text. Submit your answers for immediate AI evaluation and detailed feedback'
            },
            fullyGenerativeUIChat: {
                title: 'Fully Generative UI AI Chat',
                description: 'Engage with the most advanced AI language models in our chat interface. Get instant answers to your questions, personalized recommendations, and more.'
            }
        },
        joinPlatform: {
            title: "Don't Miss Out! Join this amazing platform today.",
            description: 'Be part of an educational revolution. Subscribe now and unlock your potential with our AI-powered LMS.',
            items: {
                builtForAllLearners: {
                    title: 'Built for All Learners',
                    description: 'From beginners to experts, our platform supports every learning journey.'
                },
                easeOfUse: {
                    title: 'Ease of use',
                    description: 'User-friendly interface that makes learning as simple and engaging as it should be.'
                },
                affordablePricing: {
                    title: 'Affordable Pricing',
                    description: 'Competitive rates with no hidden fees. Choose what works best for you.'
                },
                satisfactionGuaranteed: {
                    title: 'Satisfaction Guaranteed',
                    description: 'Money-back guarantee if our service doesn\'t meet your expectations.'
                },
                buildWithLove: {
                    title: 'Build with love',
                    description: 'We are a team of passionate individuals who love what we do.'
                },
                buildWithNextjs: {
                    title: 'Built with Next.js',
                    description: 'Next.js is a React framework that makes it easy to build fast, production-ready web applications.'
                }
            }
        },
        geminiCompetition: {
            title: 'Gemini API Developer Competition',
            description: 'We are currently selected for the Gemini API Developer Competition. Vote for us and help us win the competition.',
            voteForUs: 'Vote for us'
        },
        waitingList: {
            title: 'Ready to signup and join the waitlist?',
            description: 'Get instant access to our state of the art project and join the waitlist.',
            joinWaitlist: 'Join Waitlist'
        }
    },
    aboutUs: {
        title: 'About Us',
        empoweringTheWorld: 'Empowering the world with LMS-AI.',
        description: 'We\'re a team of developers who loves to build and create. We\'re passionate about our work and we\'re always looking for new ways to improve our skills.',
        timeline: {
            title: 'Changelog from my journey',
            description: 'I\'ve been working on LMS-AI for the past 2 years. Here\'s a timeline of my journey.',
            items: {
                early2024: {
                    title: 'Early 2024',
                    description1: 'The Team started working on LMS-AI as a side project because whe knew that Google was creating a competition for the best AI project that uses their technology.',
                    description2: 'That was a huge opportunity for us and we decided to take it. We started working on the project and we were able to finish it in time for the competition.'
                },
                early2023: {
                    title: 'Early 2023',
                    description1: 'This project started as a thesis for Guillermo Marin, a student at the University Santa Maria. He was studying computer science and he wanted to create a project that would help students learn more effectively.',
                    description2: 'This was accepted by the university and he started working on it full-time'
                }

            }
        }
    },
    contact: {
        title: 'Contact Us',
        description: 'Please reach out to us and we will get back to you as soon as possible.',
        description2: 'We are always happy to hear from you. Please feel free to contact us with any questions or concerns you may have.',
        form: {
            name: 'Name',
            email: 'Email',
            message: 'Message',
            submit: 'Submit',
            submitting: 'Submitting...',
            subject: 'Subject',
            yourMessageHere: 'Your message here...'
        }
    },
    dashboard: {
        student: {
            CourseStudentPage: {
                lessonTitle: 'Lessons',
                examTitle: 'Exams'
            },
            LessonPage: {
                description: 'View and track your progress through the course lessons.',
            },
            StudentCourseLessonsPage: {
                completed: 'Completed',
                notStarted: 'Not Started',
                review: 'Review',
                start: 'Start',
            },
            StudentExamsCoursePage: {
                completed: 'Completed',
                notStarted: 'Not Started',
                waitingReview: 'Waiting Review',
                review: 'Review',
                start: 'Start',
            },
            StudentExamCoursePage: {
                duration: 'Duration',
            },
            StudentExamReviewCoursePage: {
                score: 'Score',
                status: 'Status',
                action: 'Action',
                teacher: 'Teacher',
                pending: 'Pending',
                review: 'Review',
                start: 'Start',
                yourAnswer: 'Your Answer',
                feedback: 'Feedback',
                true: 'True',
                false: 'False',
            }
        }
    }
} as const
