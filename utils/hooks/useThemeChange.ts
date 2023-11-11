import themeAtom, { Theme } from "@/utils/store";
import { useSetAtom } from "jotai";
import { useEffect, useState } from "react";

export default function useThemeChange(theme: string) {

    // initially set the theme and "listen" for changes to apply them to the HTML tag
    const setTheme = useSetAtom(themeAtom);
    const name = theme === 'night' ? 'dark' : 'light'
    
    useEffect(() => {

        setTheme(name as Theme);
        document.querySelector("html")?.setAttribute("data-theme", theme);
        document.querySelector("html")?.setAttribute("data-color-mode", name);

    }, [theme]);

}