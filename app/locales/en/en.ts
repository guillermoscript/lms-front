import views from "./views";

export default {
    header: {
        title: 'LMS',
        contact: 'Contact',
        about: 'About',
        pricing: 'Pricing',
        blog: 'Blog',
        login: 'Login',
        home: 'Home',
        register: 'Register'
    },
    footer: {
        quickLinks: 'Quick Links',
        contact: 'Contact',
        about: 'About',
        plans: 'Plans',
        store: 'Store',
        home: 'Home',
        login: 'Login',
        register: 'Register',
        newsletter: 'Newsletter',
        newsletterDescription: 'Subscribe to our newsletter for the latest updates and offers.',
        copyright: 'Building the future of education. © 2024.',
        subscribe: 'Subscribe',
        madeWithLove: 'Made with ❤️ and faith',
        newsletterDisclaimer: 'We will not share your email with anyone else.'
    },
    ...views
} as const
