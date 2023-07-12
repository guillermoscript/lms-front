import { useState, useEffect } from "react";

export default function useHideAfterXSeconds(miliseconds: number) {
    const [showAlert, setShowAlert] = useState<boolean>(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setShowAlert(false);
        }, miliseconds);
        return () => clearTimeout(timer);
    }, [showAlert, miliseconds]);

    return {showAlert, setShowAlert}
}