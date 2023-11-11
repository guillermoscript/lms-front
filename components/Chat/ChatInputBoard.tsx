
type ChatInputBoardProps = {
	input: string;
	handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
	handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
	isDisabled: boolean;
};

export default function ChatInputBoard({
	input,
	handleInputChange,
	isDisabled,
}: ChatInputBoardProps) {
	return (
		<div className="flex gap-3 mt-auto text-gray-500 w-full">
			<textarea
				placeholder="Mensaje"
				className="textarea resize-none h-[60px] textarea-bordered block w-full py-2 pl-4 mx-3  rounded-full outline-none  disabled:opacity-50 disabled:cursor-not-allowed"
				name="message"
				disabled={isDisabled}
				cols={10}
				rows={14}
				value={input}
				onChange={handleInputChange}
			/>
			<button
				disabled={isDisabled}
				type="submit"
				className="disabled:opacity-50 disabled:cursor-not-allowed"
			>
				<svg
					className="w-5 h-5 text-gray-500 origin-center transform rotate-90 disabled:opacity-50"
					xmlns="http:www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
				>
					<path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
				</svg>
			</button>
		</div>
	);
}

// function SettingsSection() {
// 	const [file, setFile] = useState<File | null>(null);
// 	const [progress, setProgress] = useState<number>(0);

// 	const mutation = useMutationUploadAudio({
// 		progress: setProgress,
// 	});

// 	return (
// 		<>
// 			<Popover>
// 				<PopoverTrigger>
// 					<DotsVerticalIcon className="w-5 h-5 text-gray-500" />
// 				</PopoverTrigger>
// 				<PopoverContent className="p-3 flex flex-col gap-5 bg-base-100">
// 					<input
// 						type="file"
// 						className="file-input file-input-bordered w-full"
// 						accept="audio/*"
// 						name="file"
// 						onChange={(e: any) => {
// 							console.log(e.target.files[0]);
// 							setFile(e.target.files[0]);
// 						}}
// 						disabled={mutation.isLoading}
// 					/>
// 					<AudioRecorder
// 						onRecordingComplete={() => {
// 							console.log("Audio Recorded");
// 						}}
// 						audioTrackConstraints={{
// 							noiseSuppression: true,
// 							echoCancellation: true,
// 							// autoGainControl,
// 							// channelCount,
// 							// deviceId,
// 							// groupId,
// 							// sampleRate,
// 							// sampleSize,
// 						}}
// 						onNotAllowedOrFound={(err) => console.table(err)}
// 						downloadOnSavePress={true}
// 						downloadFileExtension="webm"
// 						mediaRecorderOptions={{
// 							audioBitsPerSecond: 128000,
// 						}}
// 						showVisualizer={true}
// 					/>
// 				</PopoverContent>
// 			</Popover>

// 			{progress > 0 && <Progress value={progress} />}

// 			{mutation.isLoading && <p>Subiendo audio...</p>}
// 		</>
// 	);
// }
