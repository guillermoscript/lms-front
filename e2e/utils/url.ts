export const url = process.env.NODE_ENV === 'production'
    ? 'https://lms-front-two.vercel.app/auth/login/'
    : 'http://localhost:3000/auth/login/'
