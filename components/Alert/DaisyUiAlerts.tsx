const TYPE_OF_ALERT = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
    DEFAULT: 'default',
} as const;

type TypeOfAlert = typeof TYPE_OF_ALERT[keyof typeof TYPE_OF_ALERT];

type AlertProps = {
    type: TypeOfAlert;
    message: string;
};

const ErrorSvg = () => (<svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>);

const WarningSvg = () => (<svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>)

const SuccessSvg = () => (<svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>)

const InfoSvg = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>)

export const DaisyUiAlert = ({ type, message }: AlertProps) => {

    const isDefault = type === TYPE_OF_ALERT.DEFAULT;
    const alertClasses = `alert ${isDefault ? 'alert' : `alert alert-${type}`}`;

    const getSvg = () => {
        switch (type) {
            case TYPE_OF_ALERT.ERROR:
                return <ErrorSvg />
            case TYPE_OF_ALERT.WARNING:
                return <WarningSvg />
            case TYPE_OF_ALERT.SUCCESS:
                return <SuccessSvg />
            case TYPE_OF_ALERT.INFO:
                return <InfoSvg />
            default:
                return <InfoSvg />
        }
    }

    return (
        <div className={alertClasses}>
            {getSvg()}
            <div>
                {message}
            </div>
        </div>
    )
}