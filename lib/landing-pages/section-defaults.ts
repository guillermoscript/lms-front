import { nanoid } from 'nanoid'
import type { LandingSection, SectionType } from './types'

export function createSection(type: SectionType): LandingSection {
  return {
    id: nanoid(),
    type,
    visible: true,
    data: getDefaultData(type),
  }
}

function getDefaultData(type: SectionType): Record<string, unknown> {
  switch (type) {
    case 'hero':
      return {
        title: 'Welcome to Our Academy',
        subtitle: 'Learn from the best instructors and transform your skills.',
        ctaText: 'Browse Courses',
        ctaLink: '/courses',
        secondaryCtaText: '',
        secondaryCtaLink: '',
        backgroundImage: '',
        alignment: 'center',
      }
    case 'features':
      return {
        title: 'Why Learn With Us',
        subtitle: 'Everything you need to succeed in your learning journey.',
        columns: 3,
        items: [
          { icon: '🎓', title: 'Expert Instructors', description: 'Learn from industry professionals with real-world experience.' },
          { icon: '📱', title: 'Learn Anywhere', description: 'Access all your courses from any device, anytime.' },
          { icon: '🏆', title: 'Get Certified', description: 'Earn verifiable certificates upon course completion.' },
        ],
      }
    case 'courses':
      return {
        title: 'Featured Courses',
        subtitle: 'Start learning today with our most popular courses.',
        layout: 'grid',
        maxItems: 6,
        showPrice: true,
      }
    case 'testimonials':
      return {
        title: 'What Our Students Say',
        subtitle: 'Join thousands of satisfied learners.',
        items: [
          { name: 'Maria Garcia', role: 'Web Developer', quote: 'This platform changed my career. The courses are top-notch!', avatar: '' },
          { name: 'Carlos Ruiz', role: 'Designer', quote: 'The AI-powered exercises helped me learn much faster.', avatar: '' },
          { name: 'Ana Lopez', role: 'Data Analyst', quote: 'Got certified and landed my dream job. Highly recommend!', avatar: '' },
        ],
      }
    case 'faq':
      return {
        title: 'Frequently Asked Questions',
        subtitle: 'Everything you need to know before enrolling.',
        items: [
          { question: 'How do I enroll in a course?', answer: 'Simply click on any course, choose your payment method, and you will have instant access.' },
          { question: 'Do I get a certificate?', answer: 'Yes! Upon completing a course, you will automatically receive a verifiable digital certificate.' },
          { question: 'Can I learn at my own pace?', answer: 'Absolutely. All courses are self-paced — you can start, pause, and resume anytime.' },
        ],
      }
    case 'cta':
      return {
        title: 'Ready to Start Learning?',
        subtitle: 'Join thousands of students and start your journey today.',
        ctaText: 'Get Started',
        ctaLink: '/courses',
        style: 'gradient',
      }
    case 'stats':
      return {
        title: 'Our Numbers Speak for Themselves',
        items: [
          { value: '10,000+', label: 'Students Enrolled' },
          { value: '50+', label: 'Courses Available' },
          { value: '4.9/5', label: 'Average Rating' },
          { value: '95%', label: 'Completion Rate' },
        ],
      }
    case 'text':
      return {
        title: 'About Our Academy',
        content: 'We are passionate about education and committed to helping you achieve your goals. Our carefully crafted courses combine theory with practical experience.',
      }
    case 'image_text':
      return {
        title: 'Learn at Your Own Pace',
        content: 'Our platform is designed to fit your lifestyle. Whether you are a beginner or an expert, we have courses that will take you to the next level.',
        imageSrc: '',
        imageAlt: 'Learning illustration',
        imagePosition: 'right',
      }
    case 'video':
      return {
        title: 'See How It Works',
        subtitle: 'Watch a quick overview of our platform.',
        videoUrl: '',
      }
    case 'pricing':
      return {
        title: 'Simple, Transparent Pricing',
        subtitle: 'Choose the course that fits your needs.',
        showProducts: true,
      }
    case 'team':
      return {
        title: 'Meet Our Instructors',
        subtitle: 'Learn from experienced professionals.',
        items: [
          { name: 'John Smith', role: 'Lead Instructor', bio: '10+ years of industry experience.', avatar: '' },
          { name: 'Sarah Johnson', role: 'Senior Developer', bio: 'Full-stack developer and educator.', avatar: '' },
        ],
      }
    case 'logo_cloud':
      return {
        title: 'Trusted By',
        subtitle: 'Companies and organizations that trust us.',
        items: [
          { name: 'Company A', logoUrl: '', href: '' },
          { name: 'Company B', logoUrl: '', href: '' },
          { name: 'Company C', logoUrl: '', href: '' },
          { name: 'Company D', logoUrl: '', href: '' },
        ],
      }
    case 'gallery':
      return {
        title: 'Gallery',
        subtitle: 'A look at our community and campus.',
        columns: 3,
        items: [
          { src: '', alt: 'Image 1', caption: '' },
          { src: '', alt: 'Image 2', caption: '' },
          { src: '', alt: 'Image 3', caption: '' },
        ],
      }
    case 'banner':
      return {
        text: 'New courses available! Enroll now and get early access.',
        ctaText: 'Learn More',
        ctaLink: '/courses',
        style: 'info',
        countdownDate: '',
      }
    case 'divider':
      return {
        style: 'line',
        height: 'md',
      }
    case 'contact':
      return {
        title: 'Get in Touch',
        subtitle: 'Have questions? We would love to hear from you.',
        email: '',
        showForm: false,
        socialLinks: [],
      }
  }
}
