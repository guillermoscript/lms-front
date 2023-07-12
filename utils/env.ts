
export const apiUrl = (() => {
    switch (process.env.NEXT_PUBLIC_REACT_ENV) {
        case 'local':
            return process.env.NEXT_PUBLIC_LOCAL_API_URL;
        case 'staging':
            return process.env.NEXT_PUBLIC_STAGING_API_URL;
        default:
            return process.env.NEXT_PUBLIC_PRODUCTION_API_URL;
    }
})();

export const domainUrl = (() => {
    switch (process.env.NEXT_PUBLIC_REACT_ENV) {
        case 'local':
            return process.env.NEXT_PUBLIC_LOCAL_DOMAIN_URL;
        case 'staging':
            return process.env.NEXT_PUBLIC_STAGING_DOMAIN_URL;
        default:
            return process.env.NEXT_PUBLIC_PRODUCTION_DOMAIN_URL;
    }
})();
/**
 * set the current env.
 *.e
 * this can be local
 * staging
 * production
 */
export const appEnv = (() => process.env.NEXT_PUBLIC_REACT_ENV ?? "production")();
