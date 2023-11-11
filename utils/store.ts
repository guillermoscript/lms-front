import { atom } from "jotai";

export type Theme = "light" | "dark" | '';
const themeAtom = atom<Theme>('');

export default themeAtom;