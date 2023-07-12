const LOADER_SIZE = {
    EXTRA_SMALL: 'xs',
    SMALL: 'sm',
    MEDIUM: 'md',
    LARGE: 'lg',
} as const;

type LoaderSize = typeof LOADER_SIZE[keyof typeof LOADER_SIZE];

export const LoadSpinner = ({ size }: { size: LoaderSize }) => <span className={`loading loading-spinner loading-${size}`} />;

export const LoadDots = ({ size }: { size: LoaderSize }) => <span className={`loading loading-dots loading-${size}`} />;

export const LoadBounce = ({ size }: { size: LoaderSize }) => <span className={`loading loading-bounce loading-${size}`} />;

export const LoadRing = ({ size }: { size: LoaderSize }) => <span className={`loading loading-ring loading-${size}`} />;

export const LoadBall = ({ size }: { size: LoaderSize }) => <span className={`loading loading-ball loading-${size}`} />;

export const LoadBars = ({ size }: { size: LoaderSize }) => <span className={`loading loading-bars loading-${size}`} />;
