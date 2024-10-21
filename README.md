# LMS App with AI - README

## Table of Contents
1. [Introduction](#introduction)
2. [Features](#features)
   - [Students](#students)
   - [Teachers](#teachers)
   - [Admins](#admins)
3. [Technologies Used](#technologies-used)
4. [Getting Started](#getting-started)
5. [Subscription Plans](#subscription-plans)
6. [Future Features](#future-features)
7. [Contributing](#contributing)
8. [License](#license)

## Introduction
Welcome to the LMS App with AI! Our Learning Management System leverages advanced AI technologies to provide a seamless and intelligent learning experience. Whether you are a student, teacher, or admin, our platform tailors itself to your needs, ensuring productive learning, teaching, and management.

## Features

### Students
1. **Course Enrollment**: Students can subscribe to various plans and gain access to a wide range of courses, offering flexibility based on budget and needs.
2. **Lesson Content**: Each course consists of multiple lessons featuring an engaging UI with text and video content, review ratings, comments, and interactive elements.
3. **AI Chat with Live Feedback**: Experience an unprecedented learning aid with our unique AI chat! This feature offers **real-time feedback** as students complete their assignments. Unlike traditional LMS systems, our AI doesn't just passively wait for submission; it actively assists students by providing hints, reviews, and encouraging messages. Imagine having a personal tutor available 24/7, giving you immediate, constructive feedback and guiding you until you get the correct answer. The AI marks lessons as complete when correct answers are given, offering a celebratory generative UI message to reinforce learning success.
4. **Exams**: Courses include interactive exams with various types of questions:
   - Multiple Choice
   - True or False
   - Free Text (open questions for critical thinking)
   Exams are reviewed by teachers for initial feedback, with AI providing a preliminary review (future feature).
5. **AI Chat Page**: Prepare to be amazed by our AI Chat Page. Here, students can interact with the AI to prepare for exams, request tailored exam samples, and receive instant feedback on their responses. This isn't just an ordinary chatbot; it's a **game-like experience** reminiscent of "Who Wants to Be a Millionaire?"—but educational! The AI generates fully interactive forms featuring multiple choice, true/false, free-text, and matching questions. Each generated exam comes with real-time, detailed feedback and a score, keeping learning engaging and fun.

### Teachers
1. **Course Management**: Teachers have the ability to create, update, and delete courses. Courses contain lessons and exams, which can be customized with text, video content, and required information.
2. **Lesson Content**: Teachers can upload all necessary content for lessons, including media and assignments.
3. **Exam Creation**: Exams are customizable with multiple choice, true/false, and free text questions. Teachers can set multiple exams per course.
4. **Exam Review**: Upon exam submission, teachers receive notifications to review student answers. They can provide feedback, assign scores, and offer overall feedback for the student’s performance.

### Admins
1. **Transaction Management**: Admins have access to view all transactions, ensuring transparency and control over financial aspects.
2. **App Control**: Admins have overall control of the app, including user management, course approvals, and system monitoring.

## Technologies Used
- **Backend**: [Supabase](https://supabase.io/)
- **AI/LLM**: [OpenAI](https://openai.com/), [Gemini](https://geminiprotocol.net/)
- **Front-end**: [Next.js App Router](https://nextjs.org/docs/routing/introduction)
- **Payments**: [Stripe](https://stripe.com/)
- **Database**: Subscriptions and transactions managed via backend triggers.

## Getting Started
1. **Clone Repository**: `git clone <repository-url>`
2. **Install Dependencies**: `npm install`
3. **Environment Setup**: Configure your environment variables.
4. **Run the Application**: `npm run dev`
5. **Access Application**: Visit `http://localhost:3000/`
6. **DB**: This is a work in progress. The database is not yet available for public use nor the seed data. We are working on making it available soon.

## Subscription Plans
Our LMS offers various subscription plans tailored to different budgets and needs. Each plan grants access to specific course materials and additional benefits:
- Basic Plan
- Standard Plan
- Premium Plan

## Future Features
Upcoming enhancements include:
- [] **AI Exam Review**: Soon, our AI will provide a secondary opinion on exam submissions. This feature will not only bolster the accuracy and reliability of evaluations but also offer additional feedback, allowing students to correct their mistakes before final teacher reviews. Imagine knowing where you stand instantly and being able to improve before the final grade! (almost done!!! a few details and we are good to go)
- [] **AI Customization**: We are working on enabling personalized AI training based on individual user needs. This will empower students to shape the AI’s understanding to better support their unique learning style and requirements.
- [] **Document Uploads**: Users will soon be able to upload documents directly to the AI, enhancing its knowledge base. This feature will enable custom exam creations and targeted learning experiences tailored specifically to the user’s coursework and materials.
- [] **Assignments**: After completing lessons, students are required to answer open questions to validate their understanding. Our AI not only reviews these responses but also provides detailed feedback, helping students enhance their knowledge until they get it right. This feature is **exclusive** to our LMS, ensuring that learning is effective and mistakes are corrected in real-time.
- [] **Exercises**: We are working on adding exercises to lessons, allowing students to practice and reinforce their learning. These exercises will be reviewed by the AI, providing immediate feedback and guidance to help students improve their understanding.
- [] **AI with Voice Recognition**: Our AI will soon support voice recognition, enabling students to interact with it using voice commands. This feature will enhance the user experience, making learning more accessible and engaging.
- [] **AI you can talk to**: We are working on a feature that allows students to have conversations with the AI, asking questions and receiving answers in real-time. This will provide a more interactive and engaging learning experience, making the AI feel like a real tutor.


## Links on the project

- [Login](https://lms-front-two.vercel.app/auth/login)
- [Register](https://lms-front-two.vercel.app/auth/register)
- [Student Dashboard](https://lms-front-two.vercel.app/dashboard/student)
   - [Student Courses](https://lms-front-two.vercel.app/dashboard/student/courses)
      - [Student Course Content](https://lms-front-two.vercel.app/dashboard/student/courses/40)
      - [Student Course Exams](https://lms-front-two.vercel.app/dashboard/student/courses/40/exams)
      - [Student Course Exercises](https://lms-front-two.vercel.app/dashboard/student/courses/40/exercises)
      - [Student Chat](https://lms-front-two.vercel.app/dashboard/student/chat)

- [Teacher Dashboard](https://lms-front-two.vercel.app/dashboard/teacher)


## Contributing
We welcome contributions! Please fork the repository and submit a pull request. For major changes, it's best to open an issue first to discuss your ideas.

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
