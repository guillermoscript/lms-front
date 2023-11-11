// import { type CodeBlockEditorDescriptor } from "@mdxeditor/editor";
// import "@mdxeditor/editor/style.css";
// import React, { useState } from "react";
// import { useDarkMode } from "usehooks-ts";
// import { ThemeType } from "../ThemeSwitch";
// import { useAtomValue } from "jotai";
// import themeAtom from "@/utils/store";

// const {
// 	MDXEditor,
// 	codeBlockPlugin,
// 	headingsPlugin,
// 	listsPlugin,
// 	linkPlugin,
// 	quotePlugin,
// 	markdownShortcutPlugin,
// 	toolbarPlugin,
// 	useCodeBlockEditorContext,
// 	tablePlugin,
// 	BlockTypeSelect,
// 	BoldItalicUnderlineToggles,
// 	linkDialogPlugin,
// 	CreateLink,
// 	ListsToggle,
// 	UndoRedo,
// 	InsertTable,
// 	Separator,
// 	useLexicalNodeRemove,
// } = await import("@mdxeditor/editor");

// const PlainTextCodeEditorDescriptor: CodeBlockEditorDescriptor = {
// 	match: () => true,
// 	priority: 0,
// 	Editor: (props) => {
// 		const cb = useCodeBlockEditorContext();
// 		return (
// 			<div onKeyDown={(e) => e.nativeEvent.stopImmediatePropagation()}>
// 				<textarea
// 					rows={3}
// 					cols={20}
// 					defaultValue={props.code}
// 					onChange={(e) => cb.setCode(e.target.value)}
// 				/>
// 			</div>
// 		);
// 	},
// };

// export const SimpleMarkdownEditor = ({ markdown, className, setMarkdown }: { markdown: string, className: string, setMarkdown?: (markdown: string) => void }) => {

// 	return (
// 		<MDXEditor
// 			markdown={markdown}
// 			// onChange={setMarkdown}
// 			// contentEditableClassName={ `prose max-w-none  ${theme === "dark" ? "dark-editor" : ""}`}
// 			contentEditableClassName={className}
// 			plugins={[
// 				codeBlockPlugin({
// 					codeBlockEditorDescriptors: [PlainTextCodeEditorDescriptor],
// 				}),
// 				headingsPlugin(),
// 				listsPlugin(),
// 				linkPlugin(),
// 				quotePlugin(),
// 				linkDialogPlugin(),
// 				tablePlugin(),
// 				markdownShortcutPlugin(),
// 			]}
// 		/>
// 	)
// }

// const MarkdownEditor = ({ setMarkdown,markdown  }: {
// 	setMarkdown: (markdown: string) => void
// 	markdown: string
// }) => {
// 	const theme = useAtomValue(themeAtom)
// 	return (
// 		<MDXEditor
// 			onChange={(e) => {
// 				setMarkdown(e)
// 			}}
// 			markdown={markdown}
// 			contentEditableClassName={ `prose max-w-none  ${theme === "dark" ? "dark-editor" : ""}`}
// 			plugins={[
// 				codeBlockPlugin({
// 					codeBlockEditorDescriptors: [PlainTextCodeEditorDescriptor],
// 				}),
// 				headingsPlugin(),
// 				listsPlugin(),
// 				linkPlugin(),
// 				quotePlugin(),
// 				linkDialogPlugin(),
// 				tablePlugin(),
// 				markdownShortcutPlugin(),
// 				toolbarPlugin({ toolbarContents: () => <>
// 					<BlockTypeSelect />
// 					<BoldItalicUnderlineToggles />
// 					<Separator />
// 					<CreateLink />
// 					<Separator />
// 					<ListsToggle />
// 					<Separator />
// 					<UndoRedo />
// 					<Separator />
// 					<InsertTable />
					
// 				</> }),
// 			]}
// 		/>
// 	);
// };

// export default MarkdownEditor;
