import { useEffect } from "react";

export default function useBlockPrintScreen() {

    useEffect(() => {
        // block print screen
        window.addEventListener('keydown', function(event) {
            if (event.keyCode === 80 && (event.ctrlKey || event.metaKey) && !event.altKey && (!event.shiftKey )) {
                event.preventDefault();
                if (event.stopImmediatePropagation) {
                    event.stopImmediatePropagation();
                } else {
                    event.stopPropagation();
                }
                return;
                }
        }, true);
    
    }, []);
}