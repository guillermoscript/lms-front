import { Chat } from "@/payload-types";
import { atom } from "jotai";

export type ChatAtom = {

    id: string;
    name: string;
    type?: Chat['type'];
}

export const chatAtom = atom<ChatAtom>({
    id: "",
    name: "",
});
