import { useEffect } from "react";

export default function useThemeChange(theme: string) {

    // initially set the theme and "listen" for changes to apply them to the HTML tag
    useEffect(() => {

        document.querySelector("html")?.setAttribute("data-theme", theme);

    }, [theme]);


}