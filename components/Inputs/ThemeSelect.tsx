import { useState } from "react";
import useThemeChange from "../../utils/hooks/useThemeChange";

export default function ThemeSelect() {
    const [theme, setTheme] = useState("winter");
    const toggleTheme = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setTheme(e.target.value);
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
