import { useState } from "react";
import useThemeChange from "../../utils/hooks/useThemeChange";
import { useDarkMode } from "usehooks-ts";

const THEME_TYPES = {
    NIGHT: 'night',
    WINTER: 'winter',
} as const;

export type ThemeType = typeof THEME_TYPES[keyof typeof THEME_TYPES];

export default function ThemeSelect() {
    const { isDarkMode, toggle, enable, disable } = useDarkMode()
    const [theme, setTheme] = useState<ThemeType>(isDarkMode ? 'night' : 'winter');
    const toggleTheme = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const theme = e.target.value as ThemeType;
        setTheme(theme);
    };
    useThemeChange(theme);
    return (

        <select 
            onChange={toggleTheme}
            className="select max-w-xs">
            <option disabled selected>Selecciona un tema</option>
            <option value={"night"}>Night</option>
            <option value={"winter"}>Winter</option>
        </select>
    );
}
