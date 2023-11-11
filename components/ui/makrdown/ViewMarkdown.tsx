'use client'
import dynamic from "next/dynamic";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
// import { SimpleMarkdownEditor } from "./MarkdownEditor";

const MarkdownPreview = dynamic(() => import("@uiw/react-markdown-preview"), { ssr: false });

type EditorProps = {
    value: string;
}

export default function ViewMarkdown({value}: EditorProps) {

	return (
		<>
            {/* <SimpleMarkdownEditor
                className="prose max-w-none"
                markdown={value} /> */}
            <MarkdownPreview source={value} />
        </>
	);
}
