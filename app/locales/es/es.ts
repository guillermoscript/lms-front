import components from './components'
import views from './views'
export default {
    header: {
        title: 'LMS',
        contact: 'Contacto',
        about: 'Acerca de nosotross',
        pricing: 'Precios',
        blog: 'Blog',
        login: 'Iniciar sesión',
        home: 'Inicio',
        register: 'Registrarse'
    },
    footer: {
        quickLinks: 'Enlaces',
        contact: 'Contacto',
        about: 'Acerca de nosotross',
        plans: 'Planes',
        store: 'Tienda',
        home: 'Inicio',
        login: 'Iniciar sesión',
        register: 'Registrarse',
        newsletter: 'Newsletter',
        newsletterDescription: 'Suscríbete a nuestro boletín para las últimas actualizaciones y ofertas.',
        copyright: 'Construyendo el futuro de la educación. © 2024.',
        subscribe: 'Suscríbete',
        madeWithLove: 'Hecho con ❤️ y fe',
        newsletterDisclaimer: 'No compartiremos tu correo electrónico con nadie más.'
    },
    ...views,
    ...components
} as const
